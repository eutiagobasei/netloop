import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { MessageType, Prisma } from '@prisma/client';
import { ContactsService } from '../contacts/contacts.service';
import { AIService } from '../ai/ai.service';
import { EvolutionWebhookDto } from './dto/evolution-webhook.dto';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => AIService))
    private readonly aiService: AIService,
  ) {}

  async handleEvolutionWebhook(payload: any) {
    this.logger.log(`Webhook Evolution recebido: event=${payload?.event}`);

    // Só processa eventos de mensagens recebidas
    if (payload?.event !== 'messages.upsert') {
      this.logger.log(`Evento ignorado: ${payload?.event}`);
      return { status: 'ignored', reason: 'not a message event' };
    }

    const data = payload.data;
    if (!data || !data.key) {
      this.logger.warn('Payload inválido - sem data ou key');
      return { status: 'error', reason: 'invalid payload' };
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

    // Extrai o número de telefone do remoteJid (formato: 5511999999999@s.whatsapp.net)
    const fromPhone = remoteJid?.split('@')[0] || '';
    const pushName = data.pushName || '';

    // Extrai o conteúdo da mensagem
    let content: string | undefined;
    let audioUrl: string | undefined;
    let messageType: MessageType = MessageType.TEXT;

    if (data.message?.conversation) {
      content = data.message.conversation;
    } else if (data.message?.extendedTextMessage?.text) {
      content = data.message.extendedTextMessage.text;
    } else if (data.message?.audioMessage) {
      messageType = MessageType.AUDIO;
      audioUrl = data.message.audioMessage.url;
    } else if (data.message?.imageMessage) {
      messageType = MessageType.IMAGE;
      content = data.message.imageMessage.caption;
    }

    if (!content && messageType === MessageType.TEXT) {
      this.logger.warn('Mensagem sem conteúdo de texto');
      return { status: 'ignored', reason: 'no content' };
    }

    // Busca o primeiro admin do sistema para associar a mensagem
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
    });

    if (!admin) {
      this.logger.error('Nenhum admin encontrado no sistema');
      return { status: 'error', reason: 'no admin user' };
    }

    // Salva a mensagem
    const message = await this.prisma.whatsappMessage.create({
      data: {
        userId: admin.id,
        externalId: messageId,
        fromPhone: fromPhone,
        type: messageType,
        content: pushName ? `[${pushName}] ${content}` : content,
        audioUrl: audioUrl,
      },
    });

    this.logger.log(`Mensagem salva: ${message.id} de ${fromPhone}`);

    // Processa com IA de forma assíncrona
    this.processMessageWithAI(message.id, messageType);

    return {
      status: 'received',
      messageId: message.id,
    };
  }

  async processMessageWithAI(messageId: string, type: MessageType) {
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

      // Se for áudio, transcrever
      if (type === MessageType.AUDIO && message.audioUrl) {
        this.logger.log(`Transcrevendo áudio: ${messageId}`);
        transcription = await this.aiService.transcribeAudio(message.audioUrl);
      } else if (type === MessageType.TEXT && message.content) {
        transcription = message.content;
      }

      // Extrair dados do contato
      if (transcription) {
        this.logger.log(`Extraindo dados do texto: ${messageId}`);
        const extraction = await this.aiService.extractContactData(transcription);
        if (extraction.success) {
          extractedData = extraction.data;

          // Cria contato automaticamente se tiver nome
          if (extractedData?.name) {
            await this.createContactAutomatically(message.userId, extractedData, transcription);
          }
        }
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

      this.logger.log(`Mensagem ${messageId} processada com sucesso`);
    } catch (error) {
      this.logger.error(`Erro ao processar mensagem ${messageId}:`, error);

      // Marca como processado mesmo com erro para não reprocessar
      await this.prisma.whatsappMessage.update({
        where: { id: messageId },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    }
  }

  async reprocessMessage(messageId: string, userId: string) {
    const message = await this.getMessage(messageId, userId);

    // Reseta o status de processamento
    await this.prisma.whatsappMessage.update({
      where: { id: messageId },
      data: {
        processed: false,
        processedAt: null,
        transcription: null,
        extractedData: Prisma.DbNull,
      },
    });

    // Reprocessa
    await this.processMessageWithAI(messageId, message.type);

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

    // Cria o contato usando o serviço de contatos
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

    // TODO: Implementar verificação de assinatura específica do provider (Evolution, etc)
    return true;
  }

  private async createContactAutomatically(
    userId: string,
    extractedData: any,
    transcription: string,
  ) {
    try {
      // Verifica se já existe contato com mesmo nome
      if (extractedData.name) {
        const existingByName = await this.prisma.contact.findFirst({
          where: { ownerId: userId, name: extractedData.name },
        });

        if (existingByName) {
          this.logger.log(`Contato já existe com nome: ${extractedData.name}`);
          return;
        }
      }

      // Verifica se já existe contato com mesmo telefone
      if (extractedData.phone) {
        const existingByPhone = await this.prisma.contact.findFirst({
          where: { ownerId: userId, phone: extractedData.phone },
        });

        if (existingByPhone) {
          this.logger.log(`Contato já existe com telefone: ${extractedData.phone}`);
          return;
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

      this.logger.log(`Contato criado automaticamente: ${contact.name} (ID: ${contact.id})`);
    } catch (error) {
      this.logger.error('Erro ao criar contato automaticamente:', error);
    }
  }
}
