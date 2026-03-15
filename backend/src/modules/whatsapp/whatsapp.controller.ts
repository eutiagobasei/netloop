import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  ForbiddenException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { WhatsappService } from './whatsapp.service';
import { CreateContactFromMessageDto } from './dto/create-contact-from-message.dto';
import { MetaWebhookDto, MetaVerifyQueryDto } from './dto/meta-webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook para receber mensagens do WhatsApp (Evolution API)' })
  @ApiResponse({ status: 200, description: 'Mensagem recebida' })
  async handleWebhook(@Body() payload: any, @Headers('x-webhook-signature') signature?: string) {
    this.logger.log(`Webhook recebido: ${payload?.event || 'unknown event'}`);
    this.logger.log(`Payload keys: ${Object.keys(payload || {}).join(', ')}`);

    // Verifica a assinatura do webhook (se configurada)
    if (signature) {
      this.whatsappService.verifyWebhookSignature(signature, JSON.stringify(payload));
    }

    return this.whatsappService.handleEvolutionWebhook(payload);
  }

  @Get('messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar mensagens recebidas' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de mensagens' })
  async getMessages(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.whatsappService.getMessages(userId, page, limit);
  }

  @Get('messages/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter mensagem por ID' })
  @ApiResponse({ status: 200, description: 'Dados da mensagem' })
  async getMessage(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.whatsappService.getMessage(id, userId);
  }

  @Post('messages/:id/create-contact')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar contato a partir de uma mensagem' })
  @ApiResponse({ status: 201, description: 'Contato criado' })
  async createContactFromMessage(
    @CurrentUser('id') userId: string,
    @Param('id') messageId: string,
    @Body() dto: CreateContactFromMessageDto,
  ) {
    return this.whatsappService.createContactFromMessage(messageId, userId, dto);
  }

  // ============================================
  // META CLOUD API WEBHOOK ENDPOINTS
  // ============================================

  /**
   * Meta webhook verification endpoint
   * Meta sends a GET request to verify the webhook URL
   */
  @Get('webhook/meta')
  @Public()
  @ApiOperation({ summary: 'Verificar webhook do Meta (GET para validação)' })
  @ApiResponse({ status: 200, description: 'Challenge retornado' })
  @ApiResponse({ status: 403, description: 'Token inválido' })
  verifyMetaWebhook(@Query() query: MetaVerifyQueryDto): string {
    this.logger.log(`Meta webhook verification: mode=${query['hub.mode']}`);

    const verifyToken = this.configService.get<string>('META_VERIFY_TOKEN');

    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === verifyToken) {
      this.logger.log('Meta webhook verification successful');
      return query['hub.challenge'];
    }

    this.logger.warn('Meta webhook verification failed: invalid verify token');
    throw new ForbiddenException('Invalid verify token');
  }

  /**
   * Meta webhook endpoint for receiving messages
   * Meta sends POST requests with message events
   */
  @Post('webhook/meta')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook para receber mensagens do WhatsApp (Meta Cloud API)' })
  @ApiResponse({ status: 200, description: 'Mensagem recebida' })
  async handleMetaWebhook(
    @Body() payload: MetaWebhookDto,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    this.logger.log(`Meta webhook received: object=${payload?.object}`);
    this.logger.log(`Meta entries: ${payload?.entry?.length || 0}`);

    // Verify signature if configured
    if (signature && req.rawBody) {
      const isValid = this.whatsappService.verifyMetaSignature(
        signature,
        req.rawBody,
      );
      if (!isValid) {
        this.logger.warn('Meta webhook signature verification failed');
        throw new ForbiddenException('Invalid signature');
      }
    }

    return this.whatsappService.handleMetaWebhook(payload);
  }
}
