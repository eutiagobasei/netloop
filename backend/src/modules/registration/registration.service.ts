import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EvolutionService } from '../whatsapp/evolution.service';
import { ExtractionService } from '../ai/services/extraction.service';
import { PhoneUtil } from '../../common/utils/phone.util';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

// Timeout de 24h para expirar fluxo abandonado
const FLOW_EXPIRATION_MS = 24 * 60 * 60 * 1000;

// Limite de tentativas antes de fallback
const MAX_ATTEMPTS_FOR_NAME = 5;
const MAX_ATTEMPTS_FOR_EMAIL = 3;

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ExtractedRegistrationData {
  name?: string;
  email?: string;
  phoneConfirmed?: boolean;
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EvolutionService))
    private readonly evolutionService: EvolutionService,
    private readonly extractionService: ExtractionService,
  ) {}

  /**
   * Verifica se existe um fluxo de registro ativo para o telefone
   */
  async getActiveFlow(phone: string) {
    return this.prisma.userRegistrationFlow.findFirst({
      where: {
        phone,
        step: { notIn: ['COMPLETED', 'ABANDONED'] },
        expiresAt: { gt: new Date() },
      },
    });
  }

  /**
   * Inicia o fluxo de boas-vindas para número desconhecido
   * Agora usa IA para resposta inicial conversacional
   */
  async startWelcomeFlow(phone: string): Promise<void> {
    this.logger.log(`Iniciando fluxo de boas-vindas conversacional para ${phone}`);

    const expiresAt = new Date(Date.now() + FLOW_EXPIRATION_MS);

    // Cria ou reseta o fluxo
    await this.prisma.userRegistrationFlow.upsert({
      where: { phone },
      create: {
        phone,
        step: 'CONVERSATION',
        conversationHistory: [],
        extractedData: {},
        attemptsCount: 0,
        expiresAt,
      },
      update: {
        step: 'CONVERSATION',
        name: null,
        email: null,
        conversationHistory: [],
        extractedData: {},
        attemptsCount: 0,
        expiresAt,
        lastMessageAt: new Date(),
      },
    });

    this.logger.log(`Fluxo conversacional iniciado para ${phone}`);
  }

  /**
   * Processa resposta do usuário no fluxo de cadastro conversacional
   */
  async processFlowResponse(
    phone: string,
    message: string,
  ): Promise<{ completed: boolean; userId?: string }> {
    let flow = await this.getActiveFlow(phone);

    if (!flow) {
      // Inicia novo fluxo se não existir
      await this.startWelcomeFlow(phone);
      flow = await this.getActiveFlow(phone);
      if (!flow) {
        this.logger.error(`Falha ao criar fluxo para ${phone}`);
        return { completed: false };
      }
    }

    this.logger.log(`Processando resposta conversacional: phone=${phone}, attempts=${flow.attemptsCount}`);

    // Recupera histórico e dados extraídos
    const history = (flow.conversationHistory as unknown as ConversationMessage[]) || [];
    const extractedData = (flow.extractedData as unknown as ExtractedRegistrationData) || {};

    // Adiciona mensagem do usuário ao histórico
    const updatedHistory: ConversationMessage[] = [
      ...history,
      { role: 'user', content: message },
    ];

    // Formata telefone para exibição
    const phoneFormatted = PhoneUtil.format(phone);

    // Verifica se precisa de fallback
    const needsNameFallback = flow.attemptsCount >= MAX_ATTEMPTS_FOR_NAME && !extractedData.name;
    const needsPhoneFallback =
      extractedData.name &&
      !extractedData.phoneConfirmed &&
      flow.attemptsCount >= (MAX_ATTEMPTS_FOR_NAME + 2);
    const needsEmailFallback =
      extractedData.name &&
      extractedData.phoneConfirmed &&
      !extractedData.email &&
      flow.attemptsCount >= (MAX_ATTEMPTS_FOR_NAME + MAX_ATTEMPTS_FOR_EMAIL + 2);

    let response: string;
    let newExtractedData: ExtractedRegistrationData;
    let isComplete: boolean;

    if (needsNameFallback) {
      // Fallback direto para nome
      response = 'Desculpa, não peguei seu nome! 😅 Como posso te chamar?';
      newExtractedData = extractedData;
      isComplete = false;
    } else if (needsPhoneFallback) {
      // Fallback direto para telefone
      response = `${extractedData.name}, seu número é ${phoneFormatted}? (sim/não)`;
      newExtractedData = extractedData;
      isComplete = false;
    } else if (needsEmailFallback) {
      // Fallback direto para email
      response = `Quase lá, ${extractedData.name}! Só falta seu email pra finalizar o cadastro 📧`;
      newExtractedData = extractedData;
      isComplete = false;
    } else {
      // Usa IA para gerar resposta conversacional
      const result = await this.extractionService.generateRegistrationResponse({
        userMessage: message,
        conversationHistory: history,
        extractedData,
        phoneFormatted,
      });

      response = result.response;
      newExtractedData = {
        name: result.extracted.name || extractedData.name,
        email: result.extracted.email || extractedData.email,
        phoneConfirmed: result.extracted.phoneConfirmed || extractedData.phoneConfirmed,
      };
      isComplete = result.isComplete;
    }

    // Se registro está completo, cria o usuário
    if (isComplete && newExtractedData.name && newExtractedData.phoneConfirmed && newExtractedData.email) {
      // Normaliza telefone antes de salvar
      const normalizedPhone = PhoneUtil.normalize(phone) || phone.replace(/\D/g, '');
      return this.completeRegistration(flow.id, normalizedPhone, newExtractedData, response, updatedHistory);
    }

    // Atualiza o fluxo com novo histórico e dados
    await this.prisma.userRegistrationFlow.update({
      where: { id: flow.id },
      data: {
        conversationHistory: [
          ...updatedHistory,
          { role: 'assistant', content: response },
        ] as any,
        extractedData: newExtractedData as any,
        attemptsCount: flow.attemptsCount + 1,
        lastMessageAt: new Date(),
      },
    });

    // Envia resposta via WhatsApp
    await this.evolutionService.sendTextMessage(phone, response);

    return { completed: false };
  }

  /**
   * Finaliza o registro criando o usuário
   */
  private async completeRegistration(
    flowId: string,
    phone: string,
    data: ExtractedRegistrationData,
    aiResponse: string,
    history: ConversationMessage[],
  ): Promise<{ completed: boolean; userId?: string }> {
    const { name, email } = data;

    if (!name || !email) {
      return { completed: false };
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Verifica se email já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existingUser) {
      const errorMsg = `Ops! Esse email já está cadastrado no sistema.
Se você já tem conta, acesse pelo app.
Caso contrário, me passa outro email?`;

      await this.prisma.userRegistrationFlow.update({
        where: { id: flowId },
        data: {
          conversationHistory: [
            ...history,
            { role: 'assistant', content: errorMsg },
          ],
          extractedData: { name }, // Mantém nome, limpa email
          lastMessageAt: new Date(),
        },
      });

      await this.evolutionService.sendTextMessage(phone, errorMsg);
      return { completed: false };
    }

    // Cria o usuário
    const tempPassword = uuidv4().substring(0, 8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const formattedPhone = phone.replace(/\D/g, '');

    const user = await this.prisma.user.create({
      data: {
        email: trimmedEmail,
        password: hashedPassword,
        name,
        phone: formattedPhone,
        role: 'USER',
      },
    });

    // Marca fluxo como completo
    await this.prisma.userRegistrationFlow.update({
      where: { id: flowId },
      data: {
        name,
        email: trimmedEmail,
        step: 'COMPLETED',
        conversationHistory: [
          ...history,
          { role: 'assistant', content: aiResponse },
        ],
        lastMessageAt: new Date(),
      },
    });

    // Mensagem de conclusão personalizada
    const completionMsg = `${aiResponse}

🔐 Sua senha temporária: *${tempPassword}*

Acesse o app e altere sua senha quando quiser.
Agora é só me mandar áudios ou textos sobre pessoas que conheceu! 🚀`;

    await this.evolutionService.sendTextMessage(phone, completionMsg);

    this.logger.log(`Usuário criado via WhatsApp conversacional: ${user.id} - ${user.email}`);

    return { completed: true, userId: user.id };
  }

  /**
   * Limpa fluxos expirados (pode ser chamado via cron)
   */
  async cleanupExpiredFlows(): Promise<number> {
    const result = await this.prisma.userRegistrationFlow.updateMany({
      where: {
        expiresAt: { lt: new Date() },
        step: { notIn: ['COMPLETED', 'ABANDONED'] },
      },
      data: {
        step: 'ABANDONED',
      },
    });

    if (result.count > 0) {
      this.logger.log(`${result.count} fluxos expirados marcados como abandonados`);
    }

    return result.count;
  }
}
