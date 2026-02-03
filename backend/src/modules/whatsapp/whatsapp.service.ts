import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { MessageType, Prisma, ApprovalStatus } from '@prisma/client';
import { ContactsService } from '../contacts/contacts.service';
import { AIService } from '../ai/ai.service';
import { EvolutionService } from './evolution.service';
import { RegistrationService } from '../registration/registration.service';
import { UsersService } from '../users/users.service';

// Timeout para auto-aprovar (2 minutos)
const AUTO_APPROVE_TIMEOUT_MS = 2 * 60 * 1000;

// Timeout para expirar estado de atualização (5 minutos)
const UPDATE_STATE_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  // Estado de atualização pendente: Map<phone, { contactId, contactName, timestamp }>
  private pendingUpdates = new Map<string, { contactId: string; contactName: string; timestamp: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly contactsService: ContactsService,
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

    if (data.message?.audioMessage) {
      messageType = MessageType.AUDIO;
      audioUrl = data.message.audioMessage.url;
    } else if (data.message?.imageMessage) {
      messageType = MessageType.IMAGE;
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
    return this.processUserMessage(user.id, fromPhone, pushName, content, audioUrl, messageType, messageId, messageKey);
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

    // Se não tem conteúdo e é texto, ignora
    if (!content && messageType === MessageType.TEXT) {
      this.logger.warn('Mensagem sem conteúdo de texto');
      return { status: 'ignored', reason: 'no content' };
    }

    // Salva a mensagem
    const message = await this.prisma.whatsappMessage.create({
      data: {
        userId: userId,
        externalId: messageId,
        fromPhone: fromPhone,
        type: messageType,
        content: pushName ? `[${pushName}] ${content}` : content,
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
    this.logger.log(`Resposta de aprovação recebida: "${response}" para mensagem ${message.id}`);

    // Respostas de rejeição
    const rejectResponses = ['não', 'nao', 'n', 'cancelar', 'cancel', 'rejeitar', 'descartar'];

    // Respostas de aprovação
    const approveResponses = ['sim', 's', 'ok', 'yes', 'y', 'salvar', 'aprovar', 'confirmar', '1'];

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
        '❌ Contato descartado. Envie uma nova mensagem quando quiser adicionar outro contato.'
      );

      return { status: 'rejected' };
    }

    // Qualquer outra resposta (inclusive silêncio tratado pelo timeout) é aprovação
    if (approveResponses.includes(response) || response === 'auto') {
      return this.approveAndCreateContact(message, response === 'auto' ? 'AUTO_APPROVED' : 'APPROVED');
    }

    // Se for uma correção (contém algum dado novo), atualiza os dados extraídos
    if (response.length > 10) {
      // Tenta interpretar a resposta como correção usando IA
      return this.handleCorrectionResponse(message, response);
    }

    // Resposta não reconhecida - trata como aprovação
    return this.approveAndCreateContact(message, 'APPROVED');
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

    try {
      // Cria o contato e a conexão
      await this.createContactAndConnection(message.userId, extractedData, message.transcription || message.content);

      // Atualiza o status da mensagem
      await this.prisma.whatsappMessage.update({
        where: { id: message.id },
        data: {
          approvalStatus: status,
          approvedAt: new Date(),
          contactCreated: true,
        },
      });

      // Envia confirmação
      const confirmMessage = status === 'AUTO_APPROVED'
        ? `✅ Contato *${extractedData.name}* salvo automaticamente na sua rede!`
        : `✅ Contato *${extractedData.name}* salvo na sua rede!`;

      await this.evolutionService.sendTextMessage(message.fromPhone, confirmMessage);

      return { status: 'approved', contactName: extractedData.name };
    } catch (error) {
      this.logger.error('Erro ao criar contato:', error);
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
        }

        this.logger.log(`Mensagem ${messageId} processada com sucesso`);
        return;
      }

      // 4. OUTROS (saudação, etc) → apenas marca como processada
      await this.prisma.whatsappMessage.update({
        where: { id: messageId },
        data: {
          transcription,
          processed: true,
          processedAt: new Date(),
          approvalStatus: 'APPROVED',
        },
      });

      this.logger.log(`Mensagem ${messageId} ignorada (intent: ${intent})`);
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
    let summary = `📋 *Novo Contato Identificado*\n\n`;
    summary += `👤 *Nome:* ${data.name}\n`;

    if (data.phone) summary += `📱 *Telefone:* ${data.phone}\n`;
    if (data.email) summary += `📧 *Email:* ${data.email}\n`;
    if (data.company) summary += `🏢 *Empresa:* ${data.company}\n`;
    if (data.position) summary += `💼 *Cargo:* ${data.position}\n`;
    if (data.location) summary += `📍 *Local:* ${data.location}\n`;
    if (data.context) summary += `\n💬 *Contexto:* ${data.context}\n`;

    if (tags.length > 0) {
      summary += `\n🏷️ *Tags:* ${tags.join(', ')}\n`;
    }

    summary += `\n─────────────────\n`;
    summary += `✅ Responda *OK* para salvar\n`;
    summary += `❌ Responda *NÃO* para descartar\n`;
    summary += `✏️ Ou envie correções\n\n`;
    summary += `⏰ _Será salvo automaticamente em 2 min_`;

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

    return contact;
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
    phone?: string;
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
