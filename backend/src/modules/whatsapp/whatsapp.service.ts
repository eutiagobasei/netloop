import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { MessageType, Prisma, ApprovalStatus } from '@prisma/client';
import { ContactsService } from '../contacts/contacts.service';
import { ConnectionsService } from '../connections/connections.service';
import { AIService } from '../ai/ai.service';
import { EvolutionService } from './evolution.service';
import { RegistrationService } from '../registration/registration.service';
import { UsersService } from '../users/users.service';
import { PhoneUtil } from '@/common/utils/phone.util';
import { parseVCard } from './utils/vcard-parser';

// Timeout para auto-aprovar (2 minutos)
const AUTO_APPROVE_TIMEOUT_MS = 2 * 60 * 1000;

// Timeout para expirar estado de atualização (5 minutos)
const UPDATE_STATE_TIMEOUT_MS = 5 * 60 * 1000;

// Timeout para expirar pedido de contexto (3 minutos)
const CONTEXT_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  // Estado de atualização pendente: Map<phone, { contactId, contactName, timestamp }>
  private pendingUpdates = new Map<string, { contactId: string; contactName: string; timestamp: number }>();

  // Estado de pedido de contexto pendente: Map<phone, { contactId, contactName, timestamp }>
  private pendingContextRequests = new Map<string, { contactId: string; contactName: string; timestamp: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly contactsService: ContactsService,
    private readonly connectionsService: ConnectionsService,
    @Inject(forwardRef(() => AIService))
    private readonly aiService: AIService,
    private readonly evolutionService: EvolutionService,
    @Inject(forwardRef(() => RegistrationService))
    private readonly registrationService: RegistrationService,
    private readonly usersService: UsersService,
  ) {}

  async handleEvolutionWebhook(payload: any) {
    // Normaliza o evento para lowercase com ponto
    const rawEvent = payload?.event || '';
    const normalizedEvent = rawEvent.toLowerCase().replace(/_/g, '.');

    this.logger.log(`Webhook Evolution recebido: event=${rawEvent} (normalizado: ${normalizedEvent})`);
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

    this.logger.log(`Número extraído: ${fromPhone}, senderPn: ${data.key.senderPn}, remoteJid: ${remoteJid}`);
    const pushName = data.pushName || '';

    // Extrai o conteúdo da mensagem
    const content = this.extractMessageContent(data);
    let audioUrl: string | undefined;
    let messageType: MessageType = MessageType.TEXT;
    let vcardData: { name: string; phone: string | null; email: string | null; company: string | null } | null = null;

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
          this.logger.log(`Áudio transcrito no fluxo de registro: ${messageContent?.substring(0, 50)}...`);
        } catch (error) {
          this.logger.error(`Erro ao transcrever áudio no registro: ${error.message}`);
          await this.evolutionService.sendTextMessage(
            fromPhone,
            '🎤 Não consegui entender o áudio. Por favor, envie sua resposta por texto.'
          );
          return { status: 'audio_transcription_failed' };
        }
      }

      if (messageContent) {
        const result = await this.registrationService.processFlowResponse(fromPhone, messageContent);
        if (result.completed) {
          return { status: 'registration_completed', userId: result.userId };
        }
      }
      return { status: 'registration_in_progress' };
    }

    // Usuário cadastrado - processar mensagem normalmente
    return this.processUserMessage(user.id, fromPhone, pushName, content, audioUrl, messageType, messageId, messageKey, vcardData);
  }

  /**
   * Handler para usuário desconhecido
   */
  private async handleUnknownUser(
    phone: string,
    content: string | null,
    audioUrl?: string,
    messageType?: MessageType,
    messageKey?: any
  ) {
    // Verifica se já existe fluxo de registro ativo
    const activeFlow = await this.registrationService.getActiveFlow(phone);

    if (activeFlow) {
      // Se for áudio, transcreve primeiro usando Evolution API
      let messageContent = content;
      if (messageType === MessageType.AUDIO && messageKey) {
        try {
          messageContent = await this.transcribeAudioViaEvolution(messageKey);
          this.logger.log(`Áudio transcrito no registro (unknown): ${messageContent?.substring(0, 50)}...`);
        } catch (error) {
          this.logger.error(`Erro ao transcrever áudio no registro: ${error.message}`);
          await this.evolutionService.sendTextMessage(
            phone,
            '🎤 Não consegui entender o áudio. Por favor, envie sua resposta por texto.'
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
    vcardData?: { name: string; phone: string | null; email: string | null; company: string | null } | null,
  ) {
    // Verifica se é uma resposta de aprovação
    const pendingMessage = await this.findPendingApproval(userId, fromPhone);
    if (pendingMessage && content) {
      return this.handleApprovalResponse(pendingMessage, content.toLowerCase().trim());
    }

    // Verifica se há atualização de contato pendente
    const pendingUpdate = this.getPendingUpdate(fromPhone);
    if (pendingUpdate && content) {
      return this.handleUpdateResponse(userId, fromPhone, pendingUpdate, content, messageId);
    }

    // Verifica se há pedido de contexto pendente
    const pendingContext = this.getPendingContextRequest(fromPhone);
    if (pendingContext) {
      // Se for áudio, transcreve primeiro
      if (messageType === MessageType.AUDIO && messageKey) {
        try {
          const transcription = await this.transcribeAudioViaEvolution(messageKey);
          if (transcription) {
            return this.handleContextResponse(userId, fromPhone, pendingContext, transcription, messageId);
          }
        } catch (error) {
          this.logger.error(`Erro ao transcrever áudio para contexto: ${error.message}`);
          await this.evolutionService.sendTextMessage(
            fromPhone,
            '🎤 Não consegui entender o áudio. Por favor, envie o contexto por texto.'
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
    const rejectResponses = ['não', 'nao', 'n', 'cancelar', 'cancel', 'rejeitar', 'descartar', 'apagar', 'deletar'];

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

      await this.evolutionService.sendTextMessage(
        message.fromPhone,
        'Descartado 👍'
      );

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
        await this.evolutionService.sendTextMessage(
          message.fromPhone,
          `De onde vocês se conhecem?`
        );

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
    const updatedData = {
      ...message.extractedData,
      context: response,
      tags: [...(message.extractedData?.tags || []), response.split(' ')[0]] // Primeira palavra como tag
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
            Object.entries(extraction.data).filter(([_, v]) => v !== null && v !== undefined)
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

      await this.evolutionService.sendTextMessage(
        message.fromPhone,
        `⚠️ Não consegui identificar o telefone de *${extractedData.name}*.\n\nEnvie o número para completar o cadastro.\n_Exemplo: 21987654321_`
      ).catch(() => {});

      // Mantém status AWAITING para que a próxima mensagem seja tratada como resposta
      return { status: 'missing_phone' };
    }

    try {
      // Cria o contato e a conexão
      const contact = await this.createContactAndConnection(message.userId, extractedData, message.transcription || message.content);

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

      await this.evolutionService.sendTextMessage(message.fromPhone, confirmMessage);

      // NÃO pergunta mais sobre contexto - já foi perguntado antes de salvar

      return { status: 'approved', contactName: extractedData.name };
    } catch (error) {
      this.logger.error('Erro ao criar contato:', error);

      // Notifica o usuário que houve erro (ao invés de silêncio)
      await this.evolutionService.sendTextMessage(
        message.fromPhone,
        `❌ Erro ao salvar contato *${extractedData.name}*. Tente enviar novamente.`
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

        await this.evolutionService.sendTextMessage(fromPhone, contextQuestion);

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
    this.logger.log(`Estado de contexto pendente salvo para ${phone}: ${contactName} (${contactId})`);
  }

  /**
   * Obtém estado de pedido de contexto pendente (se não expirou)
   */
  private getPendingContextRequest(phone: string): { contactId: string; contactName: string } | null {
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
    messageId: string
  ) {
    this.logger.log(`Processando contexto adicional para ${pendingContext.contactName}: "${content}"`);

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
      const newContext = existingContext
        ? `${existingContext}\n\n${content}`
        : content;

      // Atualiza o contato com o novo contexto
      await this.prisma.contact.update({
        where: { id: pendingContext.contactId },
        data: {
          context: newContext,
          notes: existingContact?.notes
            ? `${existingContact.notes}\n${content}`
            : content,
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
      await this.evolutionService.sendTextMessage(
        fromPhone,
        `✨ Contexto adicionado a *${pendingContext.contactName}*! Seu contato agora está mais completo.`
      );

      this.logger.log(`Contexto adicionado para ${pendingContext.contactName}`);
      return { status: 'context_added', contactId: pendingContext.contactId };

    } catch (error) {
      this.logger.error(`Erro ao adicionar contexto: ${error.message}`);

      await this.evolutionService.sendTextMessage(
        fromPhone,
        `❌ Erro ao adicionar contexto. Tente novamente.`
      ).catch(() => {});

      return { status: 'error' };
    }
  }

  async processMessageWithAI(messageId: string, type: MessageType, fromPhone: string, messageKey?: any) {
    this.logger.log(`Processando mensagem ${messageId} com IA`);

    const message = await this.prisma.whatsappMessage.findUnique({
      where: { id: messageId },
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

      // 1. CLASSIFICAR INTENÇÃO DA MENSAGEM
      const intent = await this.aiService.classifyIntent(transcription);
      this.logger.log(`Intenção detectada para ${messageId}: ${intent}`);

      // 2. SE FOR QUERY → BUSCAR E RESPONDER
      if (intent === 'query') {
        const querySubject = await this.aiService.extractQuerySubject(transcription);

        if (querySubject) {
          const searchResult = await this.contactsService.search(message.userId, querySubject);
          this.logger.log(`Resultado da busca: type=${searchResult.type}, data.length=${searchResult.data?.length || 0}`);

          // Se não encontrou em 1º grau, busca em 2º grau
          if (searchResult.type === 'nenhum') {
            const secondDegreeResults = await this.connectionsService.getSecondDegreeContacts(
              message.userId,
              querySubject
            );

            if (secondDegreeResults.length > 0) {
              // Encontrou conexões de 2º grau - formata mensagem de "ponte"
              const bridgeMessage = this.formatBridgeMessage(secondDegreeResults, querySubject);
              await this.evolutionService.sendTextMessage(fromPhone, bridgeMessage);

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

              this.logger.log(`Query de 2º grau processada para ${messageId}: ${querySubject} - ${secondDegreeResults.length} resultados`);
              return;
            }
          }

          // Retorna resultado normal (1º grau ou nenhum)
          await this.sendSearchResponse(fromPhone, searchResult);
        } else {
          // Não conseguiu extrair o assunto, responde pedindo mais detalhes
          await this.evolutionService.sendTextMessage(
            fromPhone,
            '🤔 Não entendi sobre quem você quer saber. Pode me dizer o nome da pessoa?'
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

        this.logger.log(`Query processada para ${messageId}: ${querySubject || 'assunto não identificado'}`);
        return;
      }

      // 3. SE FOR UPDATE_CONTACT → FLUXO DE ATUALIZAÇÃO
      if (intent === 'update_contact') {
        const contactName = await this.aiService.extractQuerySubject(transcription);

        if (contactName) {
          const existingContact = await this.contactsService.searchByNameNormalized(
            message.userId,
            contactName
          );

          if (existingContact) {
            // Encontrou o contato - salva estado de atualização pendente
            this.setPendingUpdate(fromPhone, existingContact.id, existingContact.name);

            // Mostra dados atuais e pede novas informações
            await this.sendUpdatePrompt(fromPhone, existingContact);
          } else {
            // Não encontrou - pergunta qual contato
            await this.evolutionService.sendTextMessage(
              fromPhone,
              `🤔 Não encontrei *${contactName}* na sua rede.\n\nQual contato você quer atualizar?`
            );
          }
        } else {
          // Não conseguiu extrair o nome
          await this.evolutionService.sendTextMessage(
            fromPhone,
            '🤔 Não entendi qual contato você quer atualizar. Pode me dizer o nome da pessoa?'
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

        this.logger.log(`Update contact processado para ${messageId}: ${contactName || 'nome não identificado'}`);
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

        await this.evolutionService.sendTextMessage(
          fromPhone,
          '📝 Ótimo! Para cadastrar um novo contato, me envie os dados:\n\n' +
            '*Nome completo* e *telefone* (obrigatórios)\n' +
            'Pode incluir também: empresa, cargo, email, como se conheceram.\n\n' +
            '_Exemplo: "João Silva, 11999887766, trabalha na TechCorp como desenvolvedor, conheci no meetup de JS"_',
        );

        this.logger.log(`Register intent processado para ${messageId}`);
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
          await this.evolutionService.sendTextMessage(
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

        await this.evolutionService.sendTextMessage(fromPhone, greetingResponse);
        this.logger.log(`Mensagem ${messageId} respondida com saudação IA`);
      } catch (greetingError) {
        this.logger.error(`Erro ao enviar saudação para ${fromPhone}:`, greetingError);
        // Fallback: tenta enviar mensagem simples
        try {
          await this.evolutionService.sendTextMessage(
            fromPhone,
            'Olá! Como posso ajudar você hoje?',
          );
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
    result: { type: string; message: string; data: any[]; suggestions?: string[]; query?: string }
  ) {
    let responseText: string;

    if (result.type === 'nenhum') {
      const query = result.query || 'esse nome';

      // Se tem sugestões, oferece alternativas
      if (result.suggestions && result.suggestions.length > 0) {
        const suggestionList = result.suggestions.slice(0, 3).map(s => `*${s}*`).join(', ');
        responseText = `🤔 Hmm, não encontrei ninguém chamado *${query}* na sua rede.\n\nVocê quis dizer ${suggestionList}?\n\n💡 _Ou envie informações sobre a pessoa para cadastrá-la._`;
      } else {
        // Sem sugestões - mensagem simples mas conversacional
        responseText = `🤔 Não encontrei *${query}* na sua rede ainda.\n\n💡 _Envie um áudio ou texto com informações sobre essa pessoa e eu cadastro pra você!_`;
      }
    } else {
      // Encontrou - resposta direta do service já é conversacional
      responseText = result.message;
    }

    await this.evolutionService.sendTextMessage(toPhone, responseText);
  }

  /**
   * Formata mensagem de "ponte" para conexões de 2º grau
   * Indica quem do 1º grau pode conectar o usuário com alguém da área buscada
   */
  private formatBridgeMessage(
    connections: { id: string; area: string; connectorName: string; connectorId: string | null }[],
    query: string
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
   * Envia prompt para atualização de contato existente
   */
  private async sendUpdatePrompt(toPhone: string, contact: any) {
    let message = `📝 *Atualizar: ${contact.name}*\n\n`;
    message += `*Dados atuais:*\n`;

    if (contact.company) message += `🏢 Empresa: ${contact.company}\n`;
    if (contact.position) message += `💼 Cargo: ${contact.position}\n`;
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

    await this.evolutionService.sendTextMessage(toPhone, message);
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
    const audioBuffer = await this.evolutionService.downloadMedia(messageKey, 'audio');

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
  private async handleUpdateResponse(
    userId: string,
    fromPhone: string,
    pendingUpdate: { contactId: string; contactName: string },
    content: string,
    messageId: string
  ) {
    this.logger.log(`Processando atualização para ${pendingUpdate.contactName}: "${content}"`);

    try {
      // Extrai os dados da mensagem de atualização
      const extraction = await this.aiService.extractContactData(content);

      if (!extraction.success || !extraction.data) {
        await this.evolutionService.sendTextMessage(
          fromPhone,
          `🤔 Não consegui entender as informações. Tente enviar no formato:\n"email: novo@email.com, empresa: Nova Empresa"`
        );
        return { status: 'extraction_failed' };
      }

      // Prepara os dados para atualização (apenas campos não vazios)
      const updateData: any = {};
      if (extraction.data.phone) updateData.phone = extraction.data.phone;
      if (extraction.data.email) updateData.email = extraction.data.email;
      if (extraction.data.company) updateData.company = extraction.data.company;
      if (extraction.data.position) updateData.position = extraction.data.position;
      if (extraction.data.location) updateData.location = extraction.data.location;
      if (extraction.data.context) updateData.notes = extraction.data.context;

      // Se extraiu um nome diferente, não atualiza o nome (era só contexto)
      // A não ser que o usuário tenha explicitamente pedido para mudar o nome

      if (Object.keys(updateData).length === 0) {
        await this.evolutionService.sendTextMessage(
          fromPhone,
          `🤔 Não encontrei informações para atualizar. O que você quer mudar em *${pendingUpdate.contactName}*?`
        );
        return { status: 'no_update_data' };
      }

      // Atualiza o contato existente
      const updatedContact = await this.contactsService.update(
        pendingUpdate.contactId,
        userId,
        updateData
      );

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
      if (updateData.company) updatedFields.push(`🏢 Empresa: ${updateData.company}`);
      if (updateData.position) updatedFields.push(`💼 Cargo: ${updateData.position}`);
      if (updateData.location) updatedFields.push(`📍 Local: ${updateData.location}`);
      if (updateData.notes) updatedFields.push(`📝 Notas: ${updateData.notes}`);

      const confirmMessage = `✅ *${pendingUpdate.contactName}* atualizado!\n\n${updatedFields.join('\n')}`;
      await this.evolutionService.sendTextMessage(fromPhone, confirmMessage);

      this.logger.log(`Contato ${pendingUpdate.contactName} atualizado com sucesso`);
      return { status: 'updated', contactId: pendingUpdate.contactId };

    } catch (error) {
      this.logger.error(`Erro ao processar atualização: ${error.message}`);
      this.clearPendingUpdate(fromPhone);

      await this.evolutionService.sendTextMessage(
        fromPhone,
        `❌ Erro ao atualizar *${pendingUpdate.contactName}*. Tente novamente.`
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
    const sent = await this.evolutionService.sendTextMessage(toPhone, summary);

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
      company: extractedData.company || undefined,
      position: extractedData.position || undefined,
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

      const namesList = otherNames.length === 1
        ? `*${otherNames[0]}*`
        : otherNames.slice(0, -1).map((n) => `*${n}*`).join(', ') + ` e *${otherNames[otherNames.length - 1]}*`;

      const message = `🔗 ${namesList} também ${otherNames.length === 1 ? 'conhece' : 'conhecem'} *${contactName}*! Vocês têm conexões em comum.`;

      // Delay de 3s para não conflitar com a mensagem de confirmação
      setTimeout(async () => {
        try {
          await this.evolutionService.sendTextMessage(currentUser.phone!, message);
          this.logger.log(`Notificação de contato em comum enviada para ${currentUser.phone}: ${message}`);
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
        const slug = tagName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

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
        await this.prisma.contactTag.create({
          data: {
            contactId,
            tagId: tag.id,
          },
        }).catch(() => {
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

  async createContactFromMessage(messageId: string, userId: string, contactData: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    position?: string;
    location?: string;
    notes?: string;
    tagIds?: string[];
  }) {
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

    return true;
  }
}
