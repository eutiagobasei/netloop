import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Get('status')
  @ApiOperation({ summary: 'Verificar se a IA está configurada' })
  @ApiResponse({ status: 200, description: 'Status da configuração' })
  async getStatus() {
    const isConfigured = await this.aiService.isConfigured();
    return {
      configured: isConfigured,
      message: isConfigured
        ? 'IA configurada e pronta para uso'
        : 'Configure a API Key do OpenAI nas configurações',
    };
  }

  @Post('transcribe')
  @ApiOperation({ summary: 'Transcrever áudio' })
  @ApiResponse({ status: 200, description: 'Transcrição do áudio' })
  async transcribe(@Body() body: { audioUrl: string }) {
    const transcription = await this.aiService.transcribeAudio(body.audioUrl);
    return { transcription };
  }

  @Post('extract')
  @ApiOperation({ summary: 'Extrair dados de contato de um texto' })
  @ApiResponse({ status: 200, description: 'Dados extraídos' })
  async extract(@Body() body: { text: string }) {
    const result = await this.aiService.extractContactData(body.text);
    return result;
  }

  @Get('search')
  @ApiOperation({ summary: 'Busca semântica em contatos' })
  @ApiQuery({ name: 'q', description: 'Texto para busca', required: true })
  @ApiQuery({ name: 'limit', description: 'Limite de resultados', required: false })
  @ApiResponse({ status: 200, description: 'Contatos encontrados' })
  async search(
    @CurrentUser('id') userId: string,
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ) {
    const results = await this.aiService.searchSimilarContacts(
      query,
      userId,
      limit || 10,
    );
    return { results };
  }

  @Post('process')
  @ApiOperation({ summary: 'Processar áudio completo (transcrição + extração)' })
  @ApiResponse({ status: 200, description: 'Resultado do processamento' })
  async process(@Body() body: { audioUrl: string }) {
    const result = await this.aiService.processMessage(body.audioUrl);
    return result;
  }
}
