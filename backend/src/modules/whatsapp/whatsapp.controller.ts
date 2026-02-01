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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { CreateContactFromMessageDto } from './dto/create-contact-from-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook para receber mensagens do WhatsApp' })
  @ApiResponse({ status: 200, description: 'Mensagem recebida' })
  async handleWebhook(
    @Body() payload: WebhookPayloadDto,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    // Verifica a assinatura do webhook (se configurada)
    if (signature) {
      this.whatsappService.verifyWebhookSignature(signature, JSON.stringify(payload));
    }

    return this.whatsappService.handleWebhook(payload);
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
}
