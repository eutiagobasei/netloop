import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EvolutionService } from '../whatsapp/evolution.service';
import { SettingsService } from '../settings/settings.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

// Timeout de 24h para expirar fluxo abandonado
const FLOW_EXPIRATION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EvolutionService))
    private readonly evolutionService: EvolutionService,
    private readonly settingsService: SettingsService,
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
   */
  async startWelcomeFlow(phone: string): Promise<void> {
    this.logger.log(`Iniciando fluxo de boas-vindas para ${phone}`);

    // Cria o registro do fluxo
    const expiresAt = new Date(Date.now() + FLOW_EXPIRATION_MS);

    await this.prisma.userRegistrationFlow.upsert({
      where: { phone },
      create: {
        phone,
        step: 'WELCOME_SENT',
        expiresAt,
      },
      update: {
        step: 'WELCOME_SENT',
        name: null,
        email: null,
        expiresAt,
        lastMessageAt: new Date(),
      },
    });

    // Busca conteúdo de boas-vindas configurado
    const welcomeText = await this.settingsService.getDecryptedValue('welcome_text');
    const welcomeAudioPath = await this.settingsService.getDecryptedValue('welcome_audio_path');
    const welcomeVideoPath = await this.settingsService.getDecryptedValue('welcome_video_path');

    // Mensagem padrão se não configurada
    const defaultWelcome = `Olá! Bem-vindo ao *NetLoop*! 👋

O primeiro sistema de conexões de networking do Brasil.

Para começar, por favor me diga seu *nome completo*:`;

    // Envia vídeo se configurado (primeiro para melhor experiência)
    if (welcomeVideoPath) {
      await this.evolutionService.sendVideoMessage(phone, welcomeVideoPath);
    }

    // Envia áudio se configurado
    if (welcomeAudioPath) {
      await this.evolutionService.sendAudioMessage(phone, welcomeAudioPath);
    }

    // Envia mensagem de texto
    await this.evolutionService.sendTextMessage(phone, welcomeText || defaultWelcome);

    // Atualiza para aguardar nome
    await this.prisma.userRegistrationFlow.update({
      where: { phone },
      data: { step: 'AWAITING_NAME' },
    });

    this.logger.log(`Boas-vindas enviadas para ${phone}`);
  }

  /**
   * Processa resposta do usuário no fluxo de cadastro
   */
  async processFlowResponse(
    phone: string,
    message: string,
  ): Promise<{ completed: boolean; userId?: string }> {
    const flow = await this.getActiveFlow(phone);

    if (!flow) {
      // Não deveria chegar aqui, mas reinicia o fluxo
      await this.startWelcomeFlow(phone);
      return { completed: false };
    }

    this.logger.log(`Processando resposta do fluxo: step=${flow.step}, phone=${phone}`);

    switch (flow.step) {
      case 'AWAITING_NAME':
        return this.handleNameResponse(flow.id, phone, message);

      case 'AWAITING_EMAIL':
        return this.handleEmailResponse(flow.id, phone, message);

      default:
        return { completed: false };
    }
  }

  private async handleNameResponse(
    flowId: string,
    phone: string,
    name: string,
  ): Promise<{ completed: boolean }> {
    // Valida nome (pelo menos 3 caracteres)
    const trimmedName = name.trim();
    if (trimmedName.length < 3) {
      await this.evolutionService.sendTextMessage(
        phone,
        'Por favor, informe seu nome completo (mínimo 3 caracteres):',
      );
      return { completed: false };
    }

    // Salva nome e pede email
    await this.prisma.userRegistrationFlow.update({
      where: { id: flowId },
      data: {
        name: trimmedName,
        step: 'AWAITING_EMAIL',
        lastMessageAt: new Date(),
      },
    });

    const firstName = trimmedName.split(' ')[0];
    await this.evolutionService.sendTextMessage(
      phone,
      `Ótimo, ${firstName}! 😊

Agora, por favor informe seu *email*:`,
    );

    return { completed: false };
  }

  private async handleEmailResponse(
    flowId: string,
    phone: string,
    email: string,
  ): Promise<{ completed: boolean; userId?: string }> {
    const trimmedEmail = email.trim().toLowerCase();

    // Valida formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      await this.evolutionService.sendTextMessage(
        phone,
        'Email inválido. Por favor, informe um email válido (ex: nome@email.com):',
      );
      return { completed: false };
    }

    // Verifica se email já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existingUser) {
      await this.evolutionService.sendTextMessage(
        phone,
        `Este email já está cadastrado no sistema.

Se você já tem conta, acesse pelo app.
Caso contrário, use outro email:`,
      );
      return { completed: false };
    }

    // Busca dados do fluxo
    const flow = await this.prisma.userRegistrationFlow.findUnique({
      where: { id: flowId },
    });

    if (!flow?.name) {
      await this.startWelcomeFlow(phone);
      return { completed: false };
    }

    // Cria o usuário
    const tempPassword = uuidv4().substring(0, 8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Formata telefone para o padrão do sistema
    const formattedPhone = phone.replace(/\D/g, '');

    const user = await this.prisma.user.create({
      data: {
        email: trimmedEmail,
        password: hashedPassword,
        name: flow.name,
        phone: formattedPhone,
        role: 'USER',
      },
    });

    // Marca fluxo como completo
    await this.prisma.userRegistrationFlow.update({
      where: { id: flowId },
      data: {
        email: trimmedEmail,
        step: 'COMPLETED',
        lastMessageAt: new Date(),
      },
    });

    // Envia confirmação
    await this.evolutionService.sendTextMessage(
      phone,
      `✅ *Cadastro concluído com sucesso!*

Seus dados:
👤 Nome: ${flow.name}
📧 Email: ${trimmedEmail}

Sua senha temporária: *${tempPassword}*

Acesse o app e altere sua senha.
Agora você pode me enviar contatos para adicionar à sua rede! 🚀`,
    );

    this.logger.log(`Usuário criado via WhatsApp: ${user.id} - ${user.email}`);

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
