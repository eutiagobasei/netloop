import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { MessageType, Prisma, ApprovalStatus } from '@prisma/client';
import { ContactsService } from '../contacts/contacts.service';
import { ConnectionsService } from '../connections/connections.service';
import { AIService } from '../ai/ai.service';
import { RegistrationService } from '../registration/registration.service';
import { UsersService } from '../users/users.service';
import { MemoryService } from '../memory/memory.service';
import { PhoneUtil } from '@/common/utils/phone.util';
import { parseVCard } from './utils/vcard-parser';
import { MessagingProviderFactory, IMessagingProvider } from './providers';
import { MetaWebhookDto } from './dto/meta-webhook.dto';

// Timeout para auto-aprovar (2 minutos)
const AUTO_APPROVE_TIMEOUT_MS = 2 * 60 * 1000;

// Timeout para expirar estado de atualização (5 minutos)
const UPDATE_STATE_TIMEOUT_MS = 5 * 60 * 1000;

// Timeout para expirar pedido de contexto (3 minutos)
const CONTEXT_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

// Timeout para expirar pedido de apresentação (5 minutos)
const INTRO_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  // Estado de atualização pendente: Map<phone, { contactId, contactName, timestamp }>
  private pendingUpdates = new Map<
    string,
    { contactId: string; contactName: string; timestamp: number }
  >();

  // Estado de pedido de contexto pendente: Map<phone, { contactId, contactName, timestamp }>
  private pendingContextRequests = new Map<
    string,
    { contactId: string; contactName: string; timestamp: number }
  >();

  // Estado de pedido de apresentação de 2º grau pendente
  private pendingIntroRequests = new Map<
    string,
    {
      connectorName: string;
      connectorPhone: string | null;
      area: string;
      query: string;
      requesterName: string;
      timestamp: number;
    }
  >();

  // Estado de disambiguação pendente
  private pendingDisambiguations = new Map<
    string,
    {
      userId: string;
      originalQuery: string;
      term: string;
      options: Array<{ key: string; label: string; description: string }>;
      clarificationContext?: string; // contexto selecionado pelo usuário
      timestamp: number;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly contactsService: ContactsService,
    private readonly connectionsService: ConnectionsService,
    @Inject(forwardRef(() => AIService))
    private readonly aiService: AIService,
    private readonly providerFactory: MessagingProviderFactory,
    @Inject(forwardRef(() => RegistrationService))
    private readonly registrationService: RegistrationService,
    private readonly usersService: UsersService,
    private readonly memoryService: MemoryService,
  ) {}

  /**
   * Get the currently configured messaging provider
   */
  private async getProvider(): Promise<IMessagingProvider> {
    return this.providerFactory.getProvider();
  }

  /**
   * Send a text message using the configured provider
   */
  private async sendTextMessage(toPhone: string, message: string): Promise<boolean> {
    const provider = await this.getProvider();
    return provider.sendTextMessage(toPhone, message);
  }

  /**
   * Send a contact using the configured provider
   */
  private async sendContact(
    toPhone: string,
    contact: { fullName: string; phoneNumber: string; organization?: string },
  ): Promise<boolean> {
    const provider = await this.getProvider();
    return provider.sendContact(toPhone, contact);
  }

  /**
   * Download media using the configured provider
   */
  private async downloadMedia(
    messageKey: any,
    type: 'audio' | 'image' | 'video' | 'document',
  ): Promise<Buffer | null> {
    const provider = await this.getProvider();
    return provider.downloadMedia(messageKey, type);
  }

  async handleEvolutionWebhook(payload: any) {
    // Normaliza o evento para lowercase com ponto
    const rawEvent = payload?.event || '';
    const normalizedEvent = rawEvent.toLowerCase().replace(/_/g, '.');

    this.logger.log(
      `Webhook Evolution recebido: event=${rawEvent} (normalizado: ${normalizedEvent})`,
    );
    this.logger.log(`Payload keys: ${Object.keys(payload || {}).join(', ')}`);

    // Só processa eventos de mensagens recebidas
    if (normalizedEvent !== 'messages.upsert') {
      this.logger.log(`Evento ignorado: ${rawEvent}`);
      return { status: 'ignored', reason: 'not a message event' };
    }

    const data = payload.data;
    if (!data || !data.key) {
      this.logger.warn('Payload inválido - sem data ou key');
      return { status: 'error', reason: 'invalid payload' };
    }

    // LOG: Debug payload completo
    this.logger.log(`Payload data.key: ${JSON.stringify(data.key)}`);
    this.logger.log(`Payload data.pushName: ${data.pushName}`);
    if (data.key.participant) {
      this.logger.log(`Participant: ${data.key.participant}`);
    }

    // Ignora mensagens enviadas por nós
    if (data.key.fromMe) {
      this.logger.log('Mensagem ignorada - enviada por nós');
      return { status: 'ignored', reason: 'fromMe' };
    }

    const messageId = data.key.id;
    const remoteJid = data.key.remoteJid;

    // Verifica se já processamos essa mensagem
    const existing = await this.prisma.whatsappMessage.findUnique({
      where: { externalId: messageId },
    });

    if (existing) {
      this.logger.log(`Mensagem ${messageId} já processada`);
      return { status: 'already_processed' };
    }

    // Extrai o número de telefone
    // Para contas comerciais: senderPn contém o número real
    // Em grupos: participant contém o número do remetente
    // Em conversas privadas: remoteJid contém o número
    let fromPhone = '';
    if (data.key.senderPn) {
      // Conta comercial - senderPn tem o número real
      fromPhone = data.key.senderPn.split('@')[0] || '';
    } else if (data.key.participant) {
      // Mensagem de grupo - usa participant
      fromPhone = data.key.participant.split('@')[0] || '';
    } else {
      // Mensagem privada normal - usa remoteJid
      fromPhone = remoteJid?.split('@')[0] || '';
    }

    this.logger.log(
      `Número extraído: ${fromPhone}, senderPn: ${data.key.senderPn}, remoteJid: ${remoteJid}`,
    );
    const pushName = data.pushName || '';

    // Extrai o conteúdo da mensagem
    const content = this.extractMessageContent(data);
    let audioUrl: string | undefined;
    let messageType: MessageType = MessageType.TEXT;
    let vcardData: {
      name: string;
      phone: string | null;
      email: string | null;
      company: string | null;
    } | null = null;

    if (data.message?.audioMessage) {
      messageType = MessageType.AUDIO;
      audioUrl = data.message.audioMessage.url;
    } else if (data.message?.imageMessage) {
      messageType = MessageType.IMAGE;
    } else if (data.message?.contactMessage) {
      messageType = MessageType.CONTACT;
      const vcard = data.message.contactMessage.vcard;
      if (vcard) {
        vcardData = parseVCard(vcard);
        // Use displayName as fallback if FN not found in vCard
        if (!vcardData.name && data.message.contactMessage.displayName) {
          vcardData.name = data.message.contactMessage.displayName;
        }
        this.logger.log(`vCard parseado: ${JSON.stringify(vcardData)}`);
      }
    }

    // Guarda a messageKey para download de mídia via Evolution API
    const messageKey = data.key;

    // NOVO: Verifica se o telefone pertence a um usuário cadastrado
    const user = await this.usersService.findByPhone(fromPhone);

    if (!user) {
      // Usuário NÃO cadastrado - verificar/iniciar fluxo de registro
      return this.handleUnknownUser(fromPhone, content, audioUrl, messageType, messageKey);
    }

    // Verifica se existe fluxo de registro ativo (para completar)
    const activeFlow = await this.registrationService.getActiveFlow(fromPhone);
    if (activeFlow) {
      // Se for áudio, transcreve primeiro usando Evolution API
      let messageContent = content;
      if (messageType === MessageType.AUDIO && messageKey) {
        try {
          messageContent = await this.transcribeAudioViaEvolution(messageKey);
          this.logger.log(
            `Áudio transcrito no fluxo de registro: ${messageContent?.substring(0, 50)}...`,
          );
        } catch (error) {
          this.logger.error(`Erro ao transcrever áudio no registro: ${error.message}`);
          await this.sendTextMessage(
            fromPhone,
            '🎤 Não consegui entender o áudio. Por favor, envie sua resposta por texto.',
          );
          return { status: 'audio_transcription_failed' };
        }
      }

      if (messageContent) {
        const result = await this.registrationService.processFlowResponse(
          fromPhone,
          messageContent,
        );
        if (result.completed) {
          return { status: 'registration_completed', userId: result.userId };
        }
      }
      return { status: 'registration_in_progress' };
    }

    // Usuário cadastrado - processar mensagem normalmente
    return this.processUserMessage(
      user.id,
      fromPhone,
      pushName,
      content,
      audioUrl,
      messageType,
      messageId,
      messageKey,
      vcardData,
    );
  }

  /**
   * Handler para usuário desconhecido
   */
  private async handleUnknownUser(
    phone: string,
    content: string | null,
    audioUrl?: string,
    messageType?: MessageType,
    messageKey?: any,
  ) {
    // Verifica se já existe fluxo de registro ativo
    const activeFlow = await this.registrationService.getActiveFlow(phone);

    if (activeFlow) {
      // Se for áudio, transcreve primeiro usando Evolution API
      let messageContent = content;
      if (messageType === MessageType.AUDIO && messageKey) {
        try {
          messageContent = await this.transcribeAudioViaEvolution(messageKey);
          this.logger.log(
            `Áudio transcrito no registro (unknown): ${messageContent?.substring(0, 50)}...`,
          );
        } catch (error) {
          this.logger.error(`Erro ao transcrever áudio no registro: ${error.message}`);
          await this.sendTextMessage(
            phone,
            '🎤 Não consegui entender o áudio. Por favor, envie sua resposta por texto.',
          );
          return { status: 'audio_transcription_failed' };
        }
      }

      // Continuar fluxo existente
      if (messageContent) {
        const result = await this.registrationService.processFlowResponse(phone, messageContent);
        if (result.completed) {
          return { status: 'registration_completed', userId: result.userId };
        }
      }
      return { status: 'registration_in_progress' };
    }

    // Iniciar novo fluxo de boas-vindas
    await this.registrationService.startWelcomeFlow(phone);

    // Processa a primeira mensagem do usuário com a IA
    if (content) {
      const result = await this.registrationService.processFlowResponse(phone, content);
      if (result.completed) {
        return { status: 'registration_completed', userId: result.userId };
      }
    }

    return { status: 'welcome_sent' };
  }

  /**
   * Extrai conteúdo de texto da mensagem
   */
  private extractMessageContent(data: any): string | null {
    if (data.message?.conversation) {
      return data.message.conversation;
    }
    if (data.message?.extendedTextMessage?.text) {
      return data.message.extendedTextMessage.text;
    }
    if (data.message?.imageMessage?.caption) {
      return data.message.imageMessage.caption;
    }
    return null;
  }

  /**
   * Processa mensagem de usuário cadastrado
   */
  private async processUserMessage(
    userId: string,
    fromPhone: string,
    pushName: string,
    content: string | null,
    audioUrl: string | undefined,
    messageType: MessageType,
    messageId: string,
    messageKey?: any,
    vcardData?: {
      name: string;
      phone: string | null;
      email: string | null;
      company: string | null;
    } | null,
  ) {
    // Verifica se é uma resposta de aprovação
    const pendingMessage = await this.findPendingApproval(userId, fromPhone);
    if (pendingMessage) {
      // Se for áudio, transcreve primeiro para usar como resposta de contexto
      if (messageType === MessageType.AUDIO && messageKey) {
        try {
          const transcription = await this.transcribeAudioViaEvolution(messageKey);
          if (transcription) {
            return this.handleApprovalResponse(pendingMessage, transcription.toLowerCase().trim());
          }
          // Se não conseguiu transcrever, avisa o usuário
          await this.sendTextMessage(
            fromPhone,
            '🎤 Não consegui entender o áudio. Por favor, envie o contexto por texto.',
          );
          return { status: 'audio_transcription_failed' };
        } catch (error) {
          this.logger.error(`Erro ao transcrever áudio para aprovação: ${error.message}`);
          await this.sendTextMessage(
            fromPhone,
            '🎤 Não consegui entender o áudio. Por favor, envie o contexto por texto.',
          );
          return { status: 'audio_transcription_failed' };
        }
      } else if (content) {
        return this.handleApprovalResponse(pendingMessage, content.toLowerCase().trim());
      }
    }

    // Verifica se há atualização de contato pendente
    const pendingUpdate = this.getPendingUpdate(fromPhone);
    if (pendingUpdate) {
      // Se for áudio, transcreve primeiro
      if (messageType === MessageType.AUDIO && messageKey) {
        try {
          const transcription = await this.transcribeAudioViaEvolution(messageKey);
          if (transcription) {
            return this.handleUpdateResponse(userId, fromPhone, pendingUpdate, transcription, messageId);
          }
          await this.sendTextMessage(
            fromPhone,
            '🎤 Não consegui entender o áudio. Por favor, envie a atualização por texto.',
          );
          return { status: 'audio_transcription_failed' };
        } catch (error) {
          this.logger.error(`Erro ao transcrever áudio para atualização: ${error.message}`);
          await this.sendTextMessage(
            fromPhone,
            '🎤 Não consegui entender o áudio. Por favor, envie a atualização por texto.',
          );
          return { status: 'audio_transcription_failed' };
        }
      } else if (content) {
        return this.handleUpdateResponse(userId, fromPhone, pendingUpdate, content, messageId);
      }
    }

    // Verifica se há pedido de contexto pendente
    const pendingContext = this.getPendingContextRequest(fromPhone);
    if (pendingContext) {
      // Se for áudio, transcreve primeiro
      if (messageType === MessageType.AUDIO && messageKey) {
        try {
          const transcription = await this.transcribeAudioViaEvolution(messageKey);
          if (transcription) {
            return this.handleContextResponse(
              userId,
              fromPhone,
              pendingContext,
              transcription,
              messageId,
            );
          }
        } catch (error) {
          this.logger.error(`Erro ao transcrever áudio para contexto: ${error.message}`);
          await this.sendTextMessage(
            fromPhone,
            '🎤 Não consegui entender o áudio. Por favor, envie o contexto por texto.',
          );
          return { status: 'audio_transcription_failed' };
        }
      } else if (content) {
        return this.handleContextResponse(userId, fromPhone, pendingContext, content, messageId);
      }
    }

    // Se não tem conteúdo e é texto, ignora
    if (!content && messageType === MessageType.TEXT) {
      this.logger.warn('Mensagem sem conteúdo de texto');
      return { status: 'ignored', reason: 'no content' };
    }

    // Se é contato compartilhado, processa diretamente (sem IA)
    if (messageType === MessageType.CONTACT && vcardData) {
      return this.processContactMessage(userId, fromPhone, messageId, vcardData);
    }

    // Salva a mensagem (não inclui pushName no content para evitar confusão na IA)
    const message = await this.prisma.whatsappMessage.create({
      data: {
        userId: userId,
        externalId: messageId,
        fromPhone: fromPhone,
        type: messageType,
        content: content,
        audioUrl: audioUrl,
        approvalStatus: 'PENDING',
      },
    });

    this.logger.log(`Mensagem salva: ${message.id} de ${fromPhone} para usuário ${userId}`);

    // Processa com IA de forma assíncrona
    this.processMessageWithAI(message.id, messageType, fromPhone, messageKey);

    return {
      status: 'received',
      messageId: message.id,
    };
  }

  /**
   * Processa mensagem de contato compartilhado (vCard)
   */
  private async processContactMessage(
    userId: string,
    fromPhone: string,
    messageId: string,
    vcardData: { name: string; phone: string | null; email: string | null; company: string | null },
  ) {
    this.logger.log(`Processando contato compartilhado: ${vcardData.name}`);

    // Prepara os dados extraídos no formato esperado
    const extractedData = {
      name: vcardData.name,
      phone: vcardData.phone,
      email: vcardData.email,
      company: vcardData.company,
    };

    // Salva a mensagem com os dados já extraídos
    const message = await this.prisma.whatsappMessage.create({
      data: {
        userId: userId,
        externalId: messageId,
        fromPhone: fromPhone,
        type: MessageType.CONTACT,
        content: `Contato compartilhado: ${vcardData.name}`,
        extractedData: extractedData,
        processed: true,
        processedAt: new Date(),
        approvalStatus: 'PENDING',
      },
    });

    this.logger.log(`Contato compartilhado salvo: ${message.id}`);

    // Envia para aprovação
    if (extractedData.name) {
      await this.sendApprovalRequest(message.id, fromPhone, extractedData);
      this.scheduleAutoApproval(message.id, fromPhone);
    }

    return {
      status: 'received',
      messageId: message.id,
      type: 'contact',
    };
  }

  private async findPendingApproval(userId: string, fromPhone: string) {
    return this.prisma.whatsappMessage.findFirst({
      where: {
        userId,
        fromPhone,
        approvalStatus: 'AWAITING',
        contactCreated: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async handleApprovalResponse(message: any, response: string) {
    this.logger.log(`Resposta recebida: "${response}" para mensagem ${message.id}`);

    // Respostas de rejeição
    const rejectResponses = [
      'não',
      'nao',
      'n',
      'cancelar',
      'cancel',
      'rejeitar',
      'descartar',
      'apagar',
      'deletar',
    ];

    // Respostas de skip (pular sem contexto)
    const skipResponses = ['pular', 'skip', 'ok', 'salvar', 'sim', 's', 'y', 'yes'];

    if (rejectResponses.includes(response)) {
      await this.prisma.whatsappMessage.update({
        where: { id: message.id },
        data: {
          approvalStatus: 'REJECTED',
          approvedAt: new Date(),
        },
      });

      await this.sendTextMessage(message.fromPhone, 'Descartado 👍');

      return { status: 'rejected' };
    }

    // Verifica se a resposta é um telefone (para caso de phone faltante)
    if (!message.extractedData?.phone) {
      const normalizedPhone = PhoneUtil.normalize(response);
      if (normalizedPhone) {
        // Mescla o telefone nos dados extraídos
        const updatedData = { ...message.extractedData, phone: normalizedPhone };
        await this.prisma.whatsappMessage.update({
          where: { id: message.id },
          data: { extractedData: updatedData },
        });

        // Pergunta o contexto agora que temos o telefone
        await this.sendTextMessage(message.fromPhone, `De onde vocês se conhecem?`);

        return { status: 'phone_added' };
      }
    }

    // Auto-aprovação pelo timeout
    if (response === 'auto') {
      return this.approveAndCreateContact(message, 'AUTO_APPROVED');
    }

    // Se pulou sem dar contexto
    if (skipResponses.includes(response)) {
      return this.approveAndCreateContact(message, 'APPROVED');
    }

    // Qualquer outra resposta é tratada como CONTEXTO (onde se conheceram)
    // Adiciona o contexto aos dados extraídos e salva
    // Tags serão extraídas pela IA no momento da criação do contato
    const updatedData = {
      ...message.extractedData,
      context: response,
    };

    await this.prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { extractedData: updatedData },
    });

    const updatedMessage = { ...message, extractedData: updatedData };
    return this.approveAndCreateContact(updatedMessage, 'APPROVED');
  }

  private async handleCorrectionResponse(message: any, correction: string) {
    try {
      const extraction = await this.aiService.extractContactData(correction);

      if (extraction.success && extraction.data) {
        // Mescla os dados originais com as correções
        const originalData = message.extractedData || {};
        const correctedData = {
          ...originalData,
          ...Object.fromEntries(
            Object.entries(extraction.data).filter(([_, v]) => v !== null && v !== undefined),
          ),
        };

        await this.prisma.whatsappMessage.update({
          where: { id: message.id },
          data: { extractedData: correctedData },
        });

        // Envia novo resumo para aprovação
        await this.sendApprovalRequest(message.id, message.fromPhone, correctedData);

        return { status: 'correction_applied' };
      }
    } catch (error) {
      this.logger.error('Erro ao processar correção:', error);
    }

    // Se não conseguiu interpretar, aprova com dados originais
    return this.approveAndCreateContact(message, 'APPROVED');
  }

  private async approveAndCreateContact(message: any, status: 'APPROVED' | 'AUTO_APPROVED') {
    const extractedData = message.extractedData;

    if (!extractedData?.name) {
      this.logger.warn('Não há dados suficientes para criar contato');
      return { status: 'no_data' };
    }

    // Valida se phone foi extraído — é obrigatório
    if (!extractedData.phone) {
      this.logger.warn(`Phone ausente para contato: ${extractedData.name}`);

      await this.sendTextMessage(
        message.fromPhone,
        `⚠️ Não consegui identificar o telefone de *${extractedData.name}*.\n\nEnvie o número para completar o cadastro.\n_Exemplo: 21987654321_`,
      ).catch(() => {});

      // Mantém status AWAITING para que a próxima mensagem seja tratada como resposta
      return { status: 'missing_phone' };
    }

    try {
      // Cria o contato e a conexão
      const contact = await this.createContactAndConnection(
        message.userId,
        extractedData,
        message.transcription || message.content,
      );

      // Atualiza o status da mensagem
      await this.prisma.whatsappMessage.update({
        where: { id: message.id },
        data: {
          approvalStatus: status,
          approvedAt: new Date(),
          contactCreated: true,
        },
      });

      // Envia confirmação simples e natural
      let confirmMessage = `Salvei *${extractedData.name}*`;
      if (extractedData.context) {
        confirmMessage += ` - ${extractedData.context}`;
      }
      confirmMessage += ` 👍`;

      await this.sendTextMessage(message.fromPhone, confirmMessage);

      // NÃO pergunta mais sobre contexto - já foi perguntado antes de salvar

      return { status: 'approved', contactName: extractedData.name };
    } catch (error) {
      this.logger.error('Erro ao criar contato:', error);

      // Notifica o usuário que houve erro (ao invés de silêncio)
      await this.sendTextMessage(
        message.fromPhone,
        `❌ Erro ao salvar contato *${extractedData.name}*. Tente enviar novamente.`,
      ).catch(() => {}); // Ignora erro do envio

      return { status: 'error' };
    }
  }

  /**
   * Pergunta ao usuário se quer adicionar informações de contexto sobre o contato
   */
  private askForContextInfo(fromPhone: string, contactId: string, contactName: string) {
    setTimeout(async () => {
      try {
        const contextQuestion = `💭 Quer adicionar alguma informação sobre *${contactName}*?\n\n_Exemplo: "Conheci na conferência de tech", "Colega de trabalho na empresa X", "Amigo do João"_\n\n_Responda com o contexto ou ignore para pular._`;

        await this.sendTextMessage(fromPhone, contextQuestion);

        // Salva estado de pedido de contexto pendente
        this.setPendingContextRequest(fromPhone, contactId, contactName);

        this.logger.log(`Pergunta de contexto enviada para ${fromPhone} sobre ${contactName}`);
      } catch (error) {
        this.logger.error(`Erro ao enviar pergunta de contexto: ${error.message}`);
      }
    }, 1500);
  }

  /**
   * Salva estado de pedido de contexto pendente
   */
  private setPendingContextRequest(phone: string, contactId: string, contactName: string) {
    this.pendingContextRequests.set(phone, {
      contactId,
      contactName,
      timestamp: Date.now(),
    });
    this.logger.log(
      `Estado de contexto pendente salvo para ${phone}: ${contactName} (${contactId})`,
    );
  }

  /**
   * Obtém estado de pedido de contexto pendente (se não expirou)
   */
  private getPendingContextRequest(
    phone: string,
  ): { contactId: string; contactName: string } | null {
    const pending = this.pendingContextRequests.get(phone);
    if (!pending) return null;

    // Verifica se expirou
    if (Date.now() - pending.timestamp > CONTEXT_REQUEST_TIMEOUT_MS) {
      this.pendingContextRequests.delete(phone);
      this.logger.log(`Estado de contexto pendente expirado para ${phone}`);
      return null;
    }

    return { contactId: pending.contactId, contactName: pending.contactName };
  }

  /**
   * Limpa estado de pedido de contexto pendente
   */
  private clearPendingContextRequest(phone: string) {
    this.pendingContextRequests.delete(phone);
    this.logger.log(`Estado de contexto pendente limpo para ${phone}`);
  }

  /**
   * Processa resposta de contexto adicional para o contato
   */
  private async handleContextResponse(
    userId: string,
    fromPhone: string,
    pendingContext: { contactId: string; contactName: string },
    content: string,
    messageId: string,
  ) {
    this.logger.log(
      `Processando contexto adicional para ${pendingContext.contactName}: "${content}"`,
    );

    try {
      // Limpa o estado de contexto pendente
      this.clearPendingContextRequest(fromPhone);

      // Busca o contato atual para pegar o contexto existente
      const existingContact = await this.prisma.contact.findUnique({
        where: { id: pendingContext.contactId },
        select: { context: true, notes: true },
      });

      // Monta o novo contexto (acumula com existente se houver)
      const existingContext = existingContact?.context || '';
      const newContext = existingContext ? `${existingContext}\n\n${content}` : content;

      // Atualiza o contato com o novo contexto
      await this.prisma.contact.update({
        where: { id: pendingContext.contactId },
        data: {
          context: newContext,
          notes: existingContact?.notes ? `${existingContact.notes}\n${content}` : content,
        },
      });

      // Salva a mensagem
      await this.prisma.whatsappMessage.create({
        data: {
          userId,
          externalId: messageId,
          fromPhone,
          type: MessageType.TEXT,
          content,
          processed: true,
          processedAt: new Date(),
          approvalStatus: 'APPROVED',
          contactCreated: false,
        },
      });

      // Envia confirmação
      await this.sendTextMessage(
        fromPhone,
        `✨ Contexto adicionado a *${pendingContext.contactName}*! Seu contato agora está mais completo.`,
      );

      this.logger.log(`Contexto adicionado para ${pendingContext.contactName}`);
      return { status: 'context_added', contactId: pendingContext.contactId };
    } catch (error) {
      this.logger.error(`Erro ao adicionar contexto: ${error.message}`);

      await this.sendTextMessage(
        fromPhone,
        `❌ Erro ao adicionar contexto. Tente novamente.`,
      ).catch(() => {});

      return { status: 'error' };
    }
  }

  async processMessageWithAI(
    messageId: string,
    type: MessageType,
    fromPhone: string,
    messageKey?: any,
  ) {
    this.logger.log(`Processando mensagem ${messageId} com IA`);

    const message = await this.prisma.whatsappMessage.findUnique({
      where: { id: messageId },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!message) {
      return;
    }

    try {
      // Verifica se IA está configurada
      const isConfigured = await this.aiService.isConfigured();
      if (!isConfigured) {
        this.logger.warn('IA não configurada, pulando processamento');
        return;
      }

      let transcription: string | null = null;
      let extractedData: any = null;

      // Se for áudio, transcrever via Evolution API
      if (type === MessageType.AUDIO && messageKey) {
        this.logger.log(`Transcrevendo áudio via Evolution: ${messageId}`);
        transcription = await this.transcribeAudioViaEvolution(messageKey);
      } else if (type === MessageType.TEXT && message.content) {
        transcription = message.content;
      }

      if (!transcription) {
        this.logger.log('Nenhum conteúdo para processar');
        return;
      }

      // 0. VERIFICAR SE HÁ DISAMBIGUAÇÃO PENDENTE
      const pendingDisambiguation = this.pendingDisambiguations.get(fromPhone);
      if (pendingDisambiguation) {
        const DISAMBIGUATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos
        const isExpired = Date.now() - pendingDisambiguation.timestamp > DISAMBIGUATION_TIMEOUT_MS;

        if (isExpired) {
          this.pendingDisambiguations.delete(fromPhone);
          this.logger.log(`[Disambiguation] Estado expirado para ${fromPhone}`);
        } else {
          // Verificar se é uma resposta numérica (1, 2, etc)
          const numericMatch = transcription.trim().match(/^(\d)$/);
          if (numericMatch) {
            const optionIndex = parseInt(numericMatch[1], 10) - 1;
            if (optionIndex >= 0 && optionIndex < pendingDisambiguation.options.length) {
              const selectedOption = pendingDisambiguation.options[optionIndex];
              const clarificationContext = `${selectedOption.label} - ${selectedOption.description}`;

              this.logger.log(
                `[Disambiguation] Opção ${optionIndex + 1} selecionada: ${selectedOption.label}`,
              );

              // Buscar todos os contatos e usar Smart Search com clarificação
              const allContacts = await this.contactsService.getAllContactsForSmartSearch(
                pendingDisambiguation.userId,
              );

              const smartResult = await this.aiService.processSmartSearch({
                userName: message.user?.name || 'Usuário',
                userMessage: pendingDisambiguation.originalQuery,
                contacts: allContacts,
                clarification: clarificationContext,
              });

              this.pendingDisambiguations.delete(fromPhone);

              // Processar resultado do Smart Search
              if (smartResult.action === 'results' && smartResult.bestMatchId) {
                const bestContact = allContacts.find((c) => c.id === smartResult.bestMatchId);

                if (bestContact) {
                  await this.sendTextMessage(fromPhone, `🎯 ${smartResult.message}`);

                  if (bestContact.phone) {
                    await this.sendContact(fromPhone, {
                      fullName: bestContact.name,
                      phoneNumber: bestContact.phone,
                    });
                  }

                  await this.prisma.whatsappMessage.update({
                    where: { id: messageId },
                    data: { transcription, processed: true, processedAt: new Date(), approvalStatus: 'APPROVED' },
                  });

                  return;
                }
              }

              // Fallback se não encontrou
              await this.sendTextMessage(fromPhone, smartResult.message || 'Não encontrei contatos relevantes para essa busca.');

              await this.prisma.whatsappMessage.update({
                where: { id: messageId },
                data: {
                  transcription,
                  processed: true,
                  processedAt: new Date(),
                  approvalStatus: 'APPROVED',
                },
              });

              return;
            }
          }

          // Se não foi resposta numérica válida, limpar estado e processar normalmente
          this.pendingDisambiguations.delete(fromPhone);
          this.logger.log(`[Disambiguation] Resposta inválida, limpando estado`);
        }
      }

      // 0b. VERIFICAR SE HÁ PEDIDO DE APRESENTAÇÃO PENDENTE
      const pendingIntro = this.pendingIntroRequests.get(fromPhone);
      if (pendingIntro) {
        const isExpired = Date.now() - pendingIntro.timestamp > INTRO_REQUEST_TIMEOUT_MS;

        if (isExpired) {
          this.pendingIntroRequests.delete(fromPhone);
          this.logger.log(`[Intro] Estado expirado para ${fromPhone}`);
        } else {
          // Usa IA para classificar a resposta no contexto de apresentação
          const introResponse = await this.aiService.classifyIntroResponse(
            transcription,
            pendingIntro.connectorName,
            pendingIntro.area,
          );
          this.logger.log(`[Intro] Classificação IA: ${introResponse}`);

          if (introResponse === 'confirm') {
            // Usuário confirmou que quer apresentação
            this.pendingIntroRequests.delete(fromPhone);

            // Envia o contato do conector para o usuário entrar em contato diretamente
            if (pendingIntro.connectorPhone) {
              const confirmMessage =
                `📱 Aqui está o contato de *${pendingIntro.connectorName}* para você pedir a apresentação:\n\n` +
                `Telefone: ${this.formatPhoneForDisplay(pendingIntro.connectorPhone)}\n\n` +
                `💡 Dica: Mencione que está procurando alguém de *${pendingIntro.area}*!`;
              await this.sendTextMessage(fromPhone, confirmMessage);

              // Envia também como vCard para facilitar salvar
              await this.sendContact(fromPhone, {
                fullName: pendingIntro.connectorName,
                phoneNumber: pendingIntro.connectorPhone,
              });
            } else {
              const confirmMessage =
                `📱 *${pendingIntro.connectorName}* pode te conectar com alguém de *${pendingIntro.area}*!\n\n` +
                `Infelizmente não tenho o telefone dele cadastrado. Você conhece ele?`;
              await this.sendTextMessage(fromPhone, confirmMessage);
            }

            this.logger.log(
              `[Intro] Contato do conector enviado para ${fromPhone}: ${pendingIntro.connectorName}`,
            );

            await this.prisma.whatsappMessage.update({
              where: { id: messageId },
              data: {
                transcription,
                processed: true,
                processedAt: new Date(),
                approvalStatus: 'APPROVED',
              },
            });
            return;
          } else if (introResponse === 'reject') {
            // Usuário recusou
            this.pendingIntroRequests.delete(fromPhone);

            await this.sendTextMessage(
              fromPhone,
              'Sem problemas! Se precisar de outra coisa, é só me chamar. 👋',
            );

            await this.prisma.whatsappMessage.update({
              where: { id: messageId },
              data: {
                transcription,
                processed: true,
                processedAt: new Date(),
                approvalStatus: 'APPROVED',
              },
            });
            return;
          }
          // Se 'other', continua o fluxo normal (usuário mudou de assunto)
          this.pendingIntroRequests.delete(fromPhone);
        }
      }

      // 1. CLASSIFICAR INTENÇÃO E EXTRAIR ASSUNTO EM UMA ÚNICA CHAMADA (50% menos API calls)
      const { intent, subject: querySubject } =
        await this.aiService.classifyAndExtract(transcription);
      this.logger.log(`Intenção detectada para ${messageId}: ${intent}, subject: ${querySubject}`);

      // 2. SE FOR QUERY → USAR SMART SEARCH COM IA
      if (intent === 'query') {
        if (querySubject) {
          // Buscar todos os contatos com contexto
          const allContacts = await this.contactsService.getAllContactsForSmartSearch(message.userId);

          // Verificar se há clarificação pendente
          const pendingClarification = this.pendingDisambiguations.get(fromPhone);
          const clarification = pendingClarification?.clarificationContext;

          // Usar Smart Search com IA
          const smartResult = await this.aiService.processSmartSearch({
            userName: message.user?.name || 'Usuário',
            userMessage: querySubject,
            contacts: allContacts,
            clarification,
          });

          this.logger.log(`Smart Search resultado: action=${smartResult.action}`);

          // Limpar clarificação pendente se existir
          if (pendingClarification) {
            this.pendingDisambiguations.delete(fromPhone);
          }

          // AÇÃO: CLARIFICAR - termo ambíguo
          if (smartResult.action === 'clarify' && smartResult.options) {
            const optionsList = smartResult.options
              .map((opt, i) => `${i + 1}. *${opt.label}* - ${opt.description}`)
              .join('\n');

            const disambiguationMessage = `🤔 ${smartResult.message}\n\n${optionsList}\n\nResponda com o número da opção desejada.`;

            await this.sendTextMessage(fromPhone, disambiguationMessage);

            // Salvar estado de disambiguação
            this.pendingDisambiguations.set(fromPhone, {
              userId: message.userId,
              originalQuery: querySubject,
              term: querySubject,
              options: smartResult.options,
              timestamp: Date.now(),
            });

            await this.prisma.whatsappMessage.update({
              where: { id: messageId },
              data: { transcription, processed: true, processedAt: new Date(), approvalStatus: 'APPROVED' },
            });

            return;
          }

          // AÇÃO: RESULTADOS - encontrou contatos relevantes
          if (smartResult.action === 'results' && smartResult.results && smartResult.bestMatchId) {
            const bestContact = allContacts.find((c) => c.id === smartResult.bestMatchId);

            if (bestContact) {
              // Enviar mensagem explicativa da IA
              await this.sendTextMessage(fromPhone, `🎯 ${smartResult.message}`);

              // Enviar vCard se tiver telefone
              if (bestContact.phone) {
                await this.sendContact(fromPhone, {
                  fullName: bestContact.name,
                  phoneNumber: bestContact.phone,
                });
              }

              await this.prisma.whatsappMessage.update({
                where: { id: messageId },
                data: { transcription, processed: true, processedAt: new Date(), approvalStatus: 'APPROVED' },
              });

              this.logger.log(`Smart Search: retornou ${bestContact.name} para "${querySubject}"`);
              return;
            }
          }

          // AÇÃO: NÃO ENCONTROU - fallback para busca tradicional
          const searchResult = await this.contactsService.search(message.userId, querySubject, true);

          // Se não encontrou em 1º grau, tenta busca por serviço/produto
          if (searchResult.type === 'nenhum') {
            const serviceResult = await this.contactsService.searchByServiceOrProduct(
              message.userId,
              querySubject,
            );

            if (serviceResult.contacts.length > 0) {
              // Encontrou prestadores de serviço - envia resposta formatada
              await this.sendServiceProviderResponse(
                fromPhone,
                serviceResult.contacts,
                querySubject,
              );

              // Atualiza a mensagem como processada
              await this.prisma.whatsappMessage.update({
                where: { id: messageId },
                data: {
                  transcription,
                  processed: true,
                  processedAt: new Date(),
                  approvalStatus: 'APPROVED',
                },
              });

              this.logger.log(
                `Query de serviço processada para ${messageId}: ${querySubject} - ${serviceResult.contacts.length} resultados via ${serviceResult.searchType}`,
              );
              return;
            }

            // Se não encontrou por serviço, tenta 2º grau
            const secondDegreeResults = await this.connectionsService.getSecondDegreeContacts(
              message.userId,
              querySubject,
            );

            if (secondDegreeResults.length > 0) {
              // Encontrou conexões de 2º grau - envia mensagem e contato do conector
              const connector = secondDegreeResults[0];
              const bridgeMessage = this.formatBridgeMessageWithContact(connector, querySubject);
              await this.sendTextMessage(fromPhone, bridgeMessage);

              // Envia o contato do conector como vCard
              if (connector.connectorPhone) {
                await this.sendContact(fromPhone, {
                  fullName: connector.connectorName,
                  phoneNumber: connector.connectorPhone,
                });
                this.logger.log(
                  `[2º grau] Contato de ${connector.connectorName} enviado para ${fromPhone}`,
                );
              }

              // Atualiza a mensagem como processada
              await this.prisma.whatsappMessage.update({
                where: { id: messageId },
                data: {
                  transcription,
                  processed: true,
                  processedAt: new Date(),
                  approvalStatus: 'APPROVED',
                },
              });

              this.logger.log(
                `Query de 2º grau processada para ${messageId}: ${querySubject} - ${secondDegreeResults.length} resultados`,
              );
              return;
            }
          }

          // Retorna resultado normal (1º grau ou nenhum)
          await this.sendSearchResponse(fromPhone, searchResult);
        } else {
          // Não conseguiu extrair o assunto, responde pedindo mais detalhes
          await this.sendTextMessage(
            fromPhone,
            '🤔 Não entendi sobre quem você quer saber. Pode me dizer o nome da pessoa?',
          );
        }

        // Atualiza a mensagem como processada
        await this.prisma.whatsappMessage.update({
          where: { id: messageId },
          data: {
            transcription,
            processed: true,
            processedAt: new Date(),
            approvalStatus: 'APPROVED',
          },
        });

        this.logger.log(
          `Query processada para ${messageId}: ${querySubject || 'assunto não identificado'}`,
        );
        return;
      }

      // 3. SE FOR UPDATE_CONTACT → FLUXO DE ATUALIZAÇÃO
      if (intent === 'update_contact') {
        const contactName = await this.aiService.extractQuerySubject(transcription);

        if (contactName) {
          const existingContact = await this.contactsService.searchByNameNormalized(
            message.userId,
            contactName,
          );

          if (existingContact) {
            // Encontrou o contato - salva estado de atualização pendente
            this.setPendingUpdate(fromPhone, existingContact.id, existingContact.name);

            // Mostra dados atuais e pede novas informações
            await this.sendUpdatePrompt(fromPhone, existingContact);
          } else {
            // Não encontrou - pergunta qual contato
            await this.sendTextMessage(
              fromPhone,
              `🤔 Não encontrei *${contactName}* na sua rede.\n\nQual contato você quer atualizar?`,
            );
          }
        } else {
          // Não conseguiu extrair o nome
          await this.sendTextMessage(
            fromPhone,
            '🤔 Não entendi qual contato você quer atualizar. Pode me dizer o nome da pessoa?',
          );
        }

        // Atualiza a mensagem como processada
        await this.prisma.whatsappMessage.update({
          where: { id: messageId },
          data: {
            transcription,
            processed: true,
            processedAt: new Date(),
            approvalStatus: 'APPROVED',
          },
        });

        this.logger.log(
          `Update contact processado para ${messageId}: ${contactName || 'nome não identificado'}`,
        );
        return;
      }

      // 3.5. SE FOR REGISTER_INTENT → pedir dados do contato
      if (intent === 'register_intent') {
        await this.prisma.whatsappMessage.update({
          where: { id: messageId },
          data: {
            transcription,
            processed: true,
            processedAt: new Date(),
            approvalStatus: 'APPROVED',
          },
        });

        await this.sendTextMessage(
          fromPhone,
          '📝 Ótimo! Para cadastrar um novo contato, me envie os dados:\n\n' +
            '*Nome completo* e *telefone* (obrigatórios)\n' +
            'Pode incluir também: empresa, cargo, email, como se conheceram.\n\n' +
            '_Exemplo: "João Silva, 11999887766, trabalha na TechCorp como desenvolvedor, conheci no meetup de JS"_',
        );

        this.logger.log(`Register intent processado para ${messageId}`);
        return;
      }

      // 3.6. SE FOR MEMORY → editar próprios dados ou consultar memória
      if (intent === 'memory') {
        this.logger.log(`[Memory] Processando pedido de memória: ${messageId}`);

        const result = await this.memoryService.processMemoryRequest(message.userId, transcription);

        await this.prisma.whatsappMessage.update({
          where: { id: messageId },
          data: {
            transcription,
            processed: true,
            processedAt: new Date(),
            approvalStatus: 'APPROVED',
          },
        });

        await this.sendTextMessage(fromPhone, result.response);

        this.logger.log(`[Memory] Processado: ${result.action}`);
        return;
      }

      if (intent === 'contact_info') {
        this.logger.log(`Extraindo dados do texto: ${messageId}`);
        const extraction = await this.aiService.extractContactData(transcription);
        if (extraction.success) {
          extractedData = extraction.data;
        }

        // Atualiza a mensagem com os dados processados
        await this.prisma.whatsappMessage.update({
          where: { id: messageId },
          data: {
            transcription,
            extractedData,
            processed: true,
            processedAt: new Date(),
          },
        });

        // Se extraiu dados de contato, envia para aprovação
        if (extractedData?.name) {
          await this.sendApprovalRequest(messageId, fromPhone, extractedData);

          // Agenda auto-aprovação
          this.scheduleAutoApproval(messageId, fromPhone);
        } else {
          // Dados insuficientes para criar contato
          await this.sendTextMessage(
            fromPhone,
            '🤔 Não consegui identificar os dados do contato. ' +
              'Pode me informar o *nome completo* e *telefone* da pessoa?',
          );
        }

        this.logger.log(`Mensagem ${messageId} processada com sucesso`);
        return;
      }

      // 4. OUTROS (saudação, etc) → gera resposta amigável via IA
      try {
        await this.prisma.whatsappMessage.update({
          where: { id: messageId },
          data: {
            transcription,
            processed: true,
            processedAt: new Date(),
            approvalStatus: 'APPROVED',
          },
        });

        // Busca nome do usuário para personalizar resposta
        const user = await this.usersService.findByPhone(fromPhone);
        this.logger.log(`Gerando saudação para usuário: ${user?.name || 'desconhecido'}`);

        const greetingResponse = await this.aiService.generateGreetingResponse(user?.name);
        this.logger.log(`Resposta gerada: ${greetingResponse.substring(0, 50)}...`);

        await this.sendTextMessage(fromPhone, greetingResponse);
        this.logger.log(`Mensagem ${messageId} respondida com saudação IA`);
      } catch (greetingError) {
        this.logger.error(`Erro ao enviar saudação para ${fromPhone}:`, greetingError);
        // Fallback: tenta enviar mensagem simples
        try {
          await this.sendTextMessage(fromPhone, 'Olá! Como posso ajudar você hoje?');
          this.logger.log(`Fallback de saudação enviado para ${fromPhone}`);
        } catch (fallbackError) {
          this.logger.error(`Fallback também falhou para ${fromPhone}:`, fallbackError);
        }
      }
    } catch (error) {
      this.logger.error(`Erro ao processar mensagem ${messageId}:`, error);

      await this.prisma.whatsappMessage.update({
        where: { id: messageId },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    }
  }

  /**
   * Envia resposta de busca de contato via WhatsApp - conversacional
   */
  private async sendSearchResponse(
    toPhone: string,
    result: { type: string; message: string; data: any[]; suggestions?: string[]; query?: string },
  ) {
    let responseText: string;

    if (result.type === 'nenhum') {
      const query = result.query || 'esse nome';

      // Se tem sugestões, oferece alternativas
      if (result.suggestions && result.suggestions.length > 0) {
        const suggestionList = result.suggestions
          .slice(0, 3)
          .map((s) => `*${s}*`)
          .join(', ');
        responseText = `🤔 Hmm, não encontrei ninguém chamado *${query}* na sua rede.\n\nVocê quis dizer ${suggestionList}?\n\n💡 _Ou envie informações sobre a pessoa para cadastrá-la._`;
      } else {
        // Sem sugestões - mensagem simples mas conversacional
        responseText = `🤔 Não encontrei *${query}* na sua rede ainda.\n\n💡 _Envie um áudio ou texto com informações sobre essa pessoa e eu cadastro pra você!_`;
      }
      await this.sendTextMessage(toPhone, responseText);
    } else if (result.type === 'direto' && result.data.length > 0) {
      // Encontrou contato direto - enviar mensagem explicativa + vCard
      const contact = result.data[0];
      const query = result.query || contact.name;

      // Mensagem explicativa com contexto
      responseText = `🔗 *${contact.name}* pode te ajudar com *${query}*!`;

      if (contact.context) {
        responseText += `\n\n📝 _${contact.context}_`;
      }

      responseText += `\n\nSegue o contato para você entrar em contato diretamente:`;

      await this.sendTextMessage(toPhone, responseText);

      // Envia vCard se tiver telefone
      if (contact.phone) {
        await this.sendContact(toPhone, {
          fullName: contact.name,
          phoneNumber: contact.phone,
        });
      }
    } else if (result.type === 'ponte' && result.data.length > 0) {
      // Conexão de 2º grau - mensagem explicativa
      responseText = result.message;
      await this.sendTextMessage(toPhone, responseText);
    } else {
      // Fallback
      responseText = result.message;
      await this.sendTextMessage(toPhone, responseText);
    }
  }

  /**
   * Envia resposta formatada para busca de serviço/produto
   */
  private async sendServiceProviderResponse(
    toPhone: string,
    contacts: any[],
    query: string,
  ): Promise<void> {
    if (contacts.length === 0) {
      return;
    }

    let responseText: string;

    if (contacts.length === 1) {
      const contact = contacts[0];
      const openers = ['Encontrei!', 'Achei!', 'Tenho uma indicação!'];
      const opener = openers[Math.floor(Math.random() * openers.length)];

      responseText = `${opener} *${contact.name}*`;

      responseText += ` pode te ajudar com *${query}*!\n`;

      if (contact.context) {
        responseText += `\n\n📝 _${contact.context}_`;
      }

      if (contact.phone) {
        responseText += `\n\n📱 ${this.formatPhoneForDisplay(contact.phone)}`;
      }

      if (contact.email) {
        responseText += `\n📧 ${contact.email}`;
      }

      // Envia também como vCard para facilitar
      if (contact.phone) {
        await this.sendTextMessage(toPhone, responseText);
        await this.sendContact(toPhone, {
          fullName: contact.name,
          phoneNumber: contact.phone,
        });
        return;
      }
    } else {
      // Múltiplos resultados
      responseText = `🔍 Encontrei ${contacts.length} contatos que podem te ajudar com *${query}*:\n`;

      for (const contact of contacts.slice(0, 3)) {
        responseText += `\n• *${contact.name}*`;
        if (contact.phone) {
          responseText += `\n  📱 ${this.formatPhoneForDisplay(contact.phone)}`;
        }
      }

      if (contacts.length > 3) {
        responseText += `\n\n_...e mais ${contacts.length - 3} contatos_`;
      }
    }

    await this.sendTextMessage(toPhone, responseText);
  }

  /**
   * Formata telefone para exibição
   */
  private formatPhoneForDisplay(phone: string): string {
    // Remove tudo que não é número
    const cleaned = phone.replace(/\D/g, '');

    // Formato brasileiro: +55 (XX) XXXXX-XXXX
    if (cleaned.length === 13 && cleaned.startsWith('55')) {
      return `+55 (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    if (cleaned.length === 12 && cleaned.startsWith('55')) {
      return `+55 (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
    }
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }

    return phone;
  }

  /**
   * Formata mensagem de "ponte" para conexões de 2º grau
   * Indica quem do 1º grau pode conectar o usuário com alguém da área buscada
   */
  private formatBridgeMessage(
    connections: { id: string; area: string; connectorName: string; connectorId: string | null }[],
    query: string,
  ): string {
    // Agrupa por conector (quem pode fazer a ponte)
    const byConnector = new Map<string, string[]>();

    for (const conn of connections) {
      const areas = byConnector.get(conn.connectorName) || [];
      if (!areas.includes(conn.area)) {
        areas.push(conn.area);
      }
      byConnector.set(conn.connectorName, areas);
    }

    if (byConnector.size === 1) {
      const [connectorName, areas] = Array.from(byConnector.entries())[0];
      const areaText = areas.length > 1 ? areas.join(', ') : areas[0];

      return `🔗 *${connectorName}* pode te conectar com alguém de *${query}*!\n\n💼 Área: ${areaText}\n\n💬 Quer que eu peça uma apresentação?`;
    }

    // Múltiplos conectores
    let message = `🔗 Encontrei conexões de 2º grau para *${query}*:\n\n`;

    for (const [name, areas] of byConnector) {
      const areaText = areas.length > 1 ? areas.slice(0, 2).join(', ') : areas[0];
      message += `• *${name}* conhece alguém de ${areaText}\n`;
    }

    message += `\n💬 Quer que eu peça uma apresentação?`;

    return message;
  }

  /**
   * Formata mensagem de conexão de 2º grau já incluindo o contato
   */
  private formatBridgeMessageWithContact(
    connector: { connectorName: string; connectorPhone: string | null; area: string },
    query: string,
  ): string {
    let message = `🔗 *${connector.connectorName}* pode te conectar com alguém de *${query}*!\n\n`;
    message += `💼 Área: ${connector.area}\n\n`;

    if (connector.connectorPhone) {
      message += `📱 Segue o contato para você entrar em contato diretamente:`;
    } else {
      message += `💡 Entre em contato com ${connector.connectorName} para pedir a apresentação!`;
    }

    return message;
  }

  /**
   * Envia prompt para atualização de contato existente
   */
  private async sendUpdatePrompt(toPhone: string, contact: any) {
    let message = `📝 *Atualizar: ${contact.name}*\n\n`;
    message += `*Dados atuais:*\n`;

    if (contact.phone) message += `📱 Telefone: ${contact.phone}\n`;
    if (contact.email) message += `📧 Email: ${contact.email}\n`;
    if (contact.location) message += `📍 Local: ${contact.location}\n`;
    if (contact.notes) message += `📋 Notas: ${contact.notes}\n`;

    // Extrai tags do contato (pode vir como array de objetos ou já formatado)
    const tags = contact.tags;
    if (tags && tags.length > 0) {
      const tagNames = tags.map((t: any) => t.tag?.name || t.name || t).filter(Boolean);
      if (tagNames.length > 0) {
        message += `\n🏷️ *Pontos de conexão:* ${tagNames.join(', ')}\n`;
      }
    }

    if (contact.context) message += `\n💬 *Contexto:*\n_${contact.context}_\n`;

    message += `\n─────────────────\n`;
    message += `✏️ Envie as informações que quer atualizar\n`;
    message += `_Exemplo: "email: novo@email.com, empresa: Nova Empresa"_`;

    await this.sendTextMessage(toPhone, message);
  }

  // ============================================
  // TRANSCRIÇÃO DE ÁUDIO VIA EVOLUTION API
  // ============================================

  /**
   * Transcreve áudio baixando via Evolution API (descriptografado)
   */
  private async transcribeAudioViaEvolution(messageKey: any): Promise<string> {
    this.logger.log(`Baixando áudio via Evolution API...`);

    // Baixa o áudio descriptografado via Evolution API
    const audioBuffer = await this.downloadMedia(messageKey, 'audio');

    if (!audioBuffer) {
      throw new Error('Falha ao baixar áudio via Evolution API');
    }

    this.logger.log(`Áudio baixado: ${audioBuffer.length} bytes. Transcrevendo...`);

    // Transcreve usando OpenAI Whisper
    const transcription = await this.aiService.transcribeFromBuffer(audioBuffer);

    return transcription;
  }

  // ============================================
  // GERENCIAMENTO DE ESTADO DE ATUALIZAÇÃO
  // ============================================

  /**
   * Salva estado de atualização pendente
   */
  private setPendingUpdate(phone: string, contactId: string, contactName: string) {
    this.pendingUpdates.set(phone, {
      contactId,
      contactName,
      timestamp: Date.now(),
    });
    this.logger.log(`Estado de atualização salvo para ${phone}: ${contactName} (${contactId})`);
  }

  /**
   * Obtém estado de atualização pendente (se não expirou)
   */
  private getPendingUpdate(phone: string): { contactId: string; contactName: string } | null {
    const pending = this.pendingUpdates.get(phone);
    if (!pending) return null;

    // Verifica se expirou
    if (Date.now() - pending.timestamp > UPDATE_STATE_TIMEOUT_MS) {
      this.pendingUpdates.delete(phone);
      this.logger.log(`Estado de atualização expirado para ${phone}`);
      return null;
    }

    return { contactId: pending.contactId, contactName: pending.contactName };
  }

  /**
   * Limpa estado de atualização pendente
   */
  private clearPendingUpdate(phone: string) {
    this.pendingUpdates.delete(phone);
    this.logger.log(`Estado de atualização limpo para ${phone}`);
  }

  /**
   * Processa resposta de atualização de contato
   */
  // Limites para validação de notas
  private readonly MAX_NOTE_LENGTH = 1000;
  private readonly MAX_TOTAL_NOTES_LENGTH = 5000;

  private async handleUpdateResponse(
    userId: string,
    fromPhone: string,
    pendingUpdate: { contactId: string; contactName: string },
    content: string,
    messageId: string,
  ) {
    this.logger.log(`Processando atualização para ${pendingUpdate.contactName}`);

    try {
      // Valida tamanho do conteúdo
      const trimmedContent = content.trim();
      if (trimmedContent.length > this.MAX_NOTE_LENGTH) {
        await this.sendTextMessage(
          fromPhone,
          `O texto está muito longo (${trimmedContent.length} caracteres). O limite é ${this.MAX_NOTE_LENGTH} caracteres.`,
        );
        return { status: 'content_too_long' };
      }

      // Prepara os dados para atualização (apenas campos não vazios)
      const updateData: Partial<{
        phone: string;
        email: string;
        location: string;
        notes: string;
        context: string;
      }> = {};

      // Tenta extrair dados estruturados (email, telefone, etc.)
      const extraction = await this.aiService.extractContactData(trimmedContent);

      if (extraction.success && extraction.data) {
        if (extraction.data.phone) updateData.phone = extraction.data.phone;
        if (extraction.data.email) updateData.email = extraction.data.email;
        if (extraction.data.location) updateData.location = extraction.data.location;
        // Não usa extraction.data.context aqui - usamos o texto original como notas se não houver campos estruturados
      }

      // SEMPRE salva como contexto/notas se não extraiu campos estruturados
      // Isso permite "casamos em abril 2022", "é meu primo", etc.
      if (Object.keys(updateData).length === 0 && trimmedContent.length > 0) {
        this.logger.log(`Salvando texto como contexto/notas: "${trimmedContent.substring(0, 50)}..."`);

        // Usa transação para evitar race condition
        const result = await this.prisma.$transaction(async (tx) => {
          const existingContact = await tx.contact.findUnique({
            where: { id: pendingUpdate.contactId },
            select: { notes: true, context: true },
          });

          const existingNotes = existingContact?.notes || '';
          const newNotes = existingNotes ? `${existingNotes}\n${trimmedContent}` : trimmedContent;

          // Valida tamanho total das notas
          if (newNotes.length > this.MAX_TOTAL_NOTES_LENGTH) {
            return { error: 'notes_too_long', currentLength: newNotes.length };
          }

          const newContext = existingContact?.context
            ? `${existingContact.context}\n${trimmedContent}`
            : trimmedContent;

          return { notes: newNotes, context: newContext };
        });

        if ('error' in result) {
          await this.sendTextMessage(
            fromPhone,
            `As notas de *${pendingUpdate.contactName}* estão muito longas. Tente remover notas antigas primeiro.`,
          );
          return { status: result.error };
        }

        updateData.notes = result.notes;
        updateData.context = result.context;
      }

      if (Object.keys(updateData).length === 0) {
        await this.sendTextMessage(
          fromPhone,
          `Não encontrei informações para atualizar. O que você quer mudar em *${pendingUpdate.contactName}*?`,
        );
        return { status: 'no_update_data' };
      }

      // Atualiza o contato existente
      await this.contactsService.update(pendingUpdate.contactId, userId, updateData);

      // Limpa o estado de atualização pendente
      this.clearPendingUpdate(fromPhone);

      // Salva a mensagem
      await this.prisma.whatsappMessage.create({
        data: {
          userId,
          externalId: messageId,
          fromPhone,
          type: MessageType.TEXT,
          content,
          processed: true,
          processedAt: new Date(),
          approvalStatus: 'APPROVED',
          contactCreated: false, // Foi atualização, não criação
        },
      });

      // Monta mensagem de confirmação com os campos atualizados
      const updatedFields: string[] = [];
      if (updateData.phone) updatedFields.push(`📱 Telefone: ${updateData.phone}`);
      if (updateData.email) updatedFields.push(`📧 Email: ${updateData.email}`);
      if (updateData.location) updatedFields.push(`📍 Local: ${updateData.location}`);
      // Para notas, mostra apenas o texto original (não concatenado) para feedback mais limpo
      if (updateData.notes) {
        const notesDisplay =
          trimmedContent.length <= 100 ? trimmedContent : trimmedContent.substring(0, 100) + '...';
        updatedFields.push(`📝 Notas: ${notesDisplay}`);
      }

      const confirmMessage = `✅ *${pendingUpdate.contactName}* atualizado!\n\n${updatedFields.join('\n')}`;
      await this.sendTextMessage(fromPhone, confirmMessage);

      this.logger.log(`Contato ${pendingUpdate.contactName} atualizado com sucesso`);
      return { status: 'updated', contactId: pendingUpdate.contactId };
    } catch (error) {
      this.logger.error(`Erro ao processar atualização: ${error.message}`);
      this.clearPendingUpdate(fromPhone);

      await this.sendTextMessage(
        fromPhone,
        `❌ Erro ao atualizar *${pendingUpdate.contactName}*. Tente novamente.`,
      );

      return { status: 'error' };
    }
  }

  private async sendApprovalRequest(messageId: string, toPhone: string, extractedData: any) {
    // Cria ou busca as tags sugeridas
    const tagNames = extractedData.tags || [];

    // Formata o resumo
    const summary = this.formatContactSummary(extractedData, tagNames);

    // Envia a mensagem de aprovação
    const sent = await this.sendTextMessage(toPhone, summary);

    if (sent) {
      await this.prisma.whatsappMessage.update({
        where: { id: messageId },
        data: {
          approvalStatus: 'AWAITING',
          approvalSentAt: new Date(),
        },
      });
    }
  }

  private formatContactSummary(data: any, tags: string[]): string {
    // Formato mais natural e conversacional
    let summary = `Achei *${data.name}*`;

    // Adiciona informações relevantes de forma natural
    const details: string[] = [];
    if (data.company) details.push(data.company);
    if (data.position) details.push(data.position);

    if (details.length > 0) {
      summary += ` - ${details.join(', ')}`;
    }

    summary += `\n`;
    if (data.phone) summary += `📱 ${data.phone}\n`;
    if (data.email) summary += `✉️ ${data.email}\n`;

    summary += `\nDe onde vocês se conhecem?`;

    return summary;
  }

  private scheduleAutoApproval(messageId: string, fromPhone: string) {
    setTimeout(async () => {
      const message = await this.prisma.whatsappMessage.findUnique({
        where: { id: messageId },
      });

      // Só auto-aprova se ainda estiver aguardando
      if (message && message.approvalStatus === 'AWAITING' && !message.contactCreated) {
        this.logger.log(`Auto-aprovando mensagem ${messageId}`);
        await this.handleApprovalResponse(message, 'auto');
      }
    }, AUTO_APPROVE_TIMEOUT_MS);
  }

  private async createContactAndConnection(
    userId: string,
    extractedData: any,
    transcription: string,
  ) {
    // Verifica se já existe contato com mesmo nome
    if (extractedData.name) {
      const existingByName = await this.prisma.contact.findFirst({
        where: { ownerId: userId, name: extractedData.name },
      });

      if (existingByName) {
        this.logger.log(`Contato já existe com nome: ${extractedData.name}`);
        return existingByName;
      }
    }

    // Verifica se já existe contato com mesmo telefone
    if (extractedData.phone) {
      const existingByPhone = await this.prisma.contact.findFirst({
        where: { ownerId: userId, phone: extractedData.phone },
      });

      if (existingByPhone) {
        this.logger.log(`Contato já existe com telefone: ${extractedData.phone}`);
        return existingByPhone;
      }
    }

    // Cria o contato
    const contact = await this.contactsService.create(userId, {
      name: extractedData.name,
      phone: extractedData.phone || undefined,
      email: extractedData.email || undefined,
      location: extractedData.location || undefined,
      notes: extractedData.context || undefined,
      context: transcription,
      rawTranscription: transcription,
    });

    this.logger.log(`Contato criado: ${contact.name} (ID: ${contact.id})`);

    // Cria a conexão automaticamente
    await this.prisma.connection.create({
      data: {
        fromUserId: userId,
        contactId: contact.id,
        strength: 'MODERATE',
        context: extractedData.context || transcription,
      },
    });

    this.logger.log(`Conexão criada para: ${contact.name}`);

    // Cria as tags se existirem
    if (extractedData.tags && Array.isArray(extractedData.tags)) {
      await this.createAndAssignTags(userId, contact.id, extractedData.tags);
    }

    // REMOVIDO: Notificação automática de contato em comum
    // Essa informação de 2º grau só deve aparecer quando o usuário
    // solicitar conexão com alguém de uma área específica
    // Ex: "preciso de alguém de móveis planejados" -> "Thiago pode te conectar com Matheus"

    return contact;
  }

  /**
   * Notifica o usuário que cadastrou o contato caso outros usuários já tenham
   * um contato com o mesmo telefone (contato em comum).
   * Envio com delay de 3s após criação para não conflitar com confirmação de "salvo".
   */
  private async notifySharedContact(userId: string, contactName: string, phone: string) {
    try {
      const phoneVariations = PhoneUtil.getVariations(phone);
      if (phoneVariations.length === 0) return;

      // Busca contatos de OUTROS users com mesmo telefone
      const sharedContacts = await this.prisma.contact.findMany({
        where: {
          ownerId: { not: userId },
          phone: { in: phoneVariations },
        },
        select: {
          owner: { select: { id: true, name: true, phone: true } },
        },
      });

      if (sharedContacts.length === 0) return;

      // Deduplica por userId
      const uniqueUsers = new Map<string, { name: string; phone: string | null }>();
      for (const sc of sharedContacts) {
        if (!uniqueUsers.has(sc.owner.id)) {
          uniqueUsers.set(sc.owner.id, { name: sc.owner.name, phone: sc.owner.phone });
        }
      }

      const otherNames = Array.from(uniqueUsers.values()).map((u) => u.name);
      if (otherNames.length === 0) return;

      // Busca o telefone do usuário que cadastrou para enviar a notificação
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true },
      });

      if (!currentUser?.phone) return;

      const namesList =
        otherNames.length === 1
          ? `*${otherNames[0]}*`
          : otherNames
              .slice(0, -1)
              .map((n) => `*${n}*`)
              .join(', ') + ` e *${otherNames[otherNames.length - 1]}*`;

      const message = `🔗 ${namesList} também ${otherNames.length === 1 ? 'conhece' : 'conhecem'} *${contactName}*! Vocês têm conexões em comum.`;

      // Delay de 3s para não conflitar com a mensagem de confirmação
      setTimeout(async () => {
        try {
          await this.sendTextMessage(currentUser.phone!, message);
          this.logger.log(
            `Notificação de contato em comum enviada para ${currentUser.phone}: ${message}`,
          );
        } catch (err) {
          this.logger.error(`Erro ao enviar notificação de contato em comum: ${err.message}`);
        }
      }, 3000);
    } catch (err) {
      this.logger.error(`Erro interno em notifySharedContact: ${err.message}`);
    }
  }

  private async createAndAssignTags(userId: string, contactId: string, tagNames: string[]) {
    for (const tagName of tagNames) {
      try {
        const slug = tagName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        // Busca ou cria a tag
        let tag = await this.prisma.tag.findFirst({
          where: { slug, createdById: userId },
        });

        if (!tag) {
          tag = await this.prisma.tag.create({
            data: {
              name: tagName,
              slug,
              type: 'FREE',
              createdById: userId,
            },
          });
          this.logger.log(`Tag criada: ${tagName}`);
        }

        // Associa a tag ao contato
        await this.prisma.contactTag
          .create({
            data: {
              contactId,
              tagId: tag.id,
            },
          })
          .catch(() => {
            // Ignora se já existir a associação
          });
      } catch (error) {
        this.logger.error(`Erro ao criar tag ${tagName}:`, error);
      }
    }
  }

  async reprocessMessage(messageId: string, userId: string) {
    const message = await this.getMessage(messageId, userId);

    await this.prisma.whatsappMessage.update({
      where: { id: messageId },
      data: {
        processed: false,
        processedAt: null,
        transcription: null,
        extractedData: Prisma.DbNull,
        approvalStatus: 'PENDING',
        approvalSentAt: null,
        approvedAt: null,
        contactCreated: false,
      },
    });

    await this.processMessageWithAI(messageId, message.type, message.fromPhone);

    return this.getMessage(messageId, userId);
  }

  async getMessages(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.whatsappMessage.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.whatsappMessage.count({ where: { userId } }),
    ]);

    return {
      data: messages,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMessage(id: string, userId: string) {
    const message = await this.prisma.whatsappMessage.findUnique({
      where: { id },
    });

    if (!message || message.userId !== userId) {
      throw new NotFoundException('Mensagem não encontrada');
    }

    return message;
  }

  async createContactFromMessage(
    messageId: string,
    userId: string,
    contactData: {
      name: string;
      phone: string;
      email?: string;
      company?: string;
      position?: string;
      location?: string;
      notes?: string;
      tagIds?: string[];
    },
  ) {
    const message = await this.getMessage(messageId, userId);

    const contact = await this.contactsService.create(userId, {
      ...contactData,
      context: message.transcription || message.content || undefined,
      rawTranscription: message.transcription || undefined,
    });

    return contact;
  }

  verifyWebhookSignature(signature: string, body: string): boolean {
    const secret = this.configService.get<string>('WHATSAPP_WEBHOOK_SECRET');

    if (!secret) {
      this.logger.warn('WHATSAPP_WEBHOOK_SECRET não configurado, pulando verificação');
      return true;
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (signature.length !== expectedSignature.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  }

  // ============================================
  // META CLOUD API WEBHOOK HANDLERS
  // ============================================

  /**
   * Verify Meta webhook signature using HMAC-SHA256
   */
  verifyMetaSignature(signature: string, rawBody: Buffer): boolean {
    const appSecret = this.configService.get<string>('META_APP_SECRET');

    if (!appSecret) {
      this.logger.warn('META_APP_SECRET not configured, skipping signature verification');
      return true;
    }

    const expectedSignature = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    // Prevent timing attack and handle different lengths
    if (expectedSignature.length !== providedSignature.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
    } catch {
      return false;
    }
  }

  /**
   * Handle incoming Meta Cloud API webhook
   */
  async handleMetaWebhook(payload: MetaWebhookDto) {
    // Verify this is a WhatsApp Business Account event
    if (payload.object !== 'whatsapp_business_account') {
      this.logger.log(`[Meta] Ignored non-WhatsApp event: ${payload.object}`);
      return { status: 'ignored', reason: 'not whatsapp_business_account' };
    }

    const results: any[] = [];

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') {
          this.logger.log(`[Meta] Ignored field: ${change.field}`);
          continue;
        }

        const value = change.value;

        // Handle message statuses (sent, delivered, read)
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            this.logger.log(`[Meta] Status update: ${status.id} -> ${status.status}`);
            // Could update message status in database if needed
          }
          continue;
        }

        // Handle incoming messages
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            const result = await this.processMetaMessage(message, value);
            results.push(result);
          }
        }
      }
    }

    return { status: 'processed', results };
  }

  /**
   * Process a single Meta webhook message
   */
  private async processMetaMessage(message: any, value: any): Promise<any> {
    const messageId = message.id;
    const fromPhone = message.from;
    const timestamp = message.timestamp;
    const type = message.type;

    this.logger.log(`[Meta] Processing message: id=${messageId}, from=${fromPhone}, type=${type}`);

    // Check for duplicate
    const existing = await this.prisma.whatsappMessage.findUnique({
      where: { externalId: messageId },
    });

    if (existing) {
      this.logger.log(`[Meta] Message ${messageId} already processed`);
      return { status: 'already_processed', messageId };
    }

    // Extract pushName from contacts if available
    const pushName = value.contacts?.[0]?.profile?.name || '';

    // Extract message content based on type
    let content: string | null = null;
    let audioUrl: string | undefined;
    let messageType: MessageType = MessageType.TEXT;
    let vcardData: any = null;
    let mediaId: string | null = null;

    switch (type) {
      case 'text':
        content = message.text?.body || null;
        messageType = MessageType.TEXT;
        break;

      case 'audio':
        messageType = MessageType.AUDIO;
        mediaId = message.audio?.id;
        break;

      case 'image':
        messageType = MessageType.IMAGE;
        mediaId = message.image?.id;
        content = message.image?.caption || null;
        break;

      case 'video':
        // Map to IMAGE since VIDEO not in schema
        messageType = MessageType.IMAGE;
        mediaId = message.video?.id;
        content = message.video?.caption || null;
        break;

      case 'document':
        // Map to TEXT since DOCUMENT not in schema
        messageType = MessageType.TEXT;
        mediaId = message.document?.id;
        content = message.document?.filename || null;
        break;

      case 'contacts':
        messageType = MessageType.CONTACT;
        if (message.contacts && message.contacts.length > 0) {
          const contact = message.contacts[0];
          vcardData = {
            name: contact.name?.formatted_name || '',
            phone: contact.phones?.[0]?.phone || null,
            email: null,
            company: null,
          };
          content = `Contato compartilhado: ${vcardData.name}`;
        }
        break;

      default:
        this.logger.warn(`[Meta] Unsupported message type: ${type}`);
        return { status: 'ignored', reason: `unsupported type: ${type}` };
    }

    // Create messageKey for media download (Meta format)
    const messageKey = mediaId ? { mediaId } : undefined;

    // Check if phone belongs to a registered user
    const user = await this.usersService.findByPhone(fromPhone);

    if (!user) {
      // Unknown user - handle registration flow
      return this.handleUnknownUser(fromPhone, content, audioUrl, messageType, messageKey);
    }

    // Check for active registration flow
    const activeFlow = await this.registrationService.getActiveFlow(fromPhone);
    if (activeFlow) {
      let messageContent = content;

      // If audio, transcribe first
      if (messageType === MessageType.AUDIO && messageKey) {
        try {
          messageContent = await this.transcribeAudioFromMeta(messageKey);
          this.logger.log(
            `[Meta] Audio transcribed in registration: ${messageContent?.substring(0, 50)}...`,
          );
        } catch (error) {
          this.logger.error(`[Meta] Error transcribing audio: ${error.message}`);
          await this.sendTextMessage(
            fromPhone,
            '🎤 Não consegui entender o áudio. Por favor, envie sua resposta por texto.',
          );
          return { status: 'audio_transcription_failed' };
        }
      }

      if (messageContent) {
        const result = await this.registrationService.processFlowResponse(
          fromPhone,
          messageContent,
        );
        if (result.completed) {
          return { status: 'registration_completed', userId: result.userId };
        }
      }
      return { status: 'registration_in_progress' };
    }

    // Registered user - process message normally
    return this.processUserMessage(
      user.id,
      fromPhone,
      pushName,
      content,
      audioUrl,
      messageType,
      messageId,
      messageKey,
      vcardData,
    );
  }

  /**
   * Transcribe audio from Meta webhook (downloads via Meta API then transcribes)
   */
  private async transcribeAudioFromMeta(messageKey: { mediaId: string }): Promise<string> {
    this.logger.log(`[Meta] Downloading audio: ${messageKey.mediaId}`);

    const audioBuffer = await this.downloadMedia(messageKey, 'audio');

    if (!audioBuffer) {
      throw new Error('Failed to download audio from Meta API');
    }

    this.logger.log(`[Meta] Audio downloaded: ${audioBuffer.length} bytes. Transcribing...`);

    const transcription = await this.aiService.transcribeFromBuffer(audioBuffer);
    return transcription;
  }

  /**
   * Envia notificação de escassez quando um membro sai de um grupo
   * Cria urgência informando quantas conexões foram perdidas
   */
  async sendScarcityNotification(
    phone: string,
    groupName: string,
    lostConnectionsCount: number,
  ): Promise<boolean> {
    if (!phone) {
      this.logger.warn('Telefone não informado para notificação de escassez');
      return false;
    }

    const message =
      `Você saiu do *${groupName}* e perdeu acesso a *${lostConnectionsCount}* conexões.\n\n` +
      `Entre em contato com o administrador do grupo para renovar sua participação.`;

    try {
      const sent = await this.sendTextMessage(phone, message);

      if (sent) {
        this.logger.log(
          `Notificação de escassez enviada para ${phone}: ${groupName} - ${lostConnectionsCount} conexões`,
        );
      }

      return sent;
    } catch (error) {
      this.logger.error(`Erro ao enviar notificação de escassez: ${error.message}`);
      return false;
    }
  }
}
