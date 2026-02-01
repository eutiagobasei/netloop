import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { MessageType, Prisma } from '@prisma/client';
import { ContactsService } from '../contacts/contacts.service';
import { AIService } from '../ai/ai.service';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';

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

  async handleWebhook(payload: WebhookPayloadDto) {
    this.logger.log(`Webhook recebido: ${JSON.stringify(payload)}`);

    // Verifica se já processamos essa mensagem
    const existing = await this.prisma.whatsappMessage.findUnique({
      where: { externalId: payload.messageId },
    });

    if (existing) {
      this.logger.log(`Mensagem ${payload.messageId} já processada`);
      return { status: 'already_processed' };
    }

    // Encontra o usuário pelo telefone
    const user = await this.prisma.user.findUnique({
      where: { phone: payload.toPhone },
    });

    if (!user) {
      this.logger.warn(`Usuário não encontrado para o telefone: ${payload.toPhone}`);
      throw new NotFoundException('Usuário não encontrado para este número');
    }

    // Determina o tipo da mensagem
    let messageType: MessageType = MessageType.TEXT;
    if (payload.audioUrl) {
      messageType = MessageType.AUDIO;
    } else if (payload.imageUrl) {
      messageType = MessageType.IMAGE;
    }

    // Salva a mensagem
    const message = await this.prisma.whatsappMessage.create({
      data: {
        userId: user.id,
        externalId: payload.messageId,
        fromPhone: payload.fromPhone,
        type: messageType,
        content: payload.content,
        audioUrl: payload.audioUrl,
      },
    });

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
}
