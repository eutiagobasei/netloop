import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './services/openai.service';
import { TranscriptionService } from './services/transcription.service';
import { ExtractionService } from './services/extraction.service';
import { EmbeddingService } from './services/embedding.service';
import { ExtractedContactData, ExtractionResult } from './dto/extracted-contact.dto';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly transcriptionService: TranscriptionService,
    private readonly extractionService: ExtractionService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Verifica se a IA está configurada (API key presente)
   */
  async isConfigured(): Promise<boolean> {
    return this.openaiService.isConfigured();
  }

  /**
   * Transcreve um áudio usando Whisper
   */
  async transcribeAudio(audioUrl: string): Promise<string> {
    return this.transcriptionService.transcribeAudio(audioUrl);
  }

  /**
   * Extrai dados de contato de um texto usando GPT
   */
  async extractContactData(text: string): Promise<ExtractionResult> {
    return this.extractionService.extractContactData(text);
  }

  /**
   * Gera embedding para um texto
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddingService.generateEmbedding(text);
  }

  /**
   * Atualiza o embedding de um contato
   */
  async updateContactEmbedding(contactId: string): Promise<void> {
    return this.embeddingService.updateContactEmbedding(contactId);
  }

  /**
   * Busca contatos similares por texto (busca semântica)
   */
  async searchSimilarContacts(query: string, userId: string, limit = 10): Promise<any[]> {
    return this.embeddingService.searchSimilarContacts(query, userId, limit);
  }

  /**
   * Processa uma mensagem completa: transcrição + extração
   */
  async processMessage(audioUrl: string): Promise<{
    transcription: string;
    extraction: ExtractionResult;
  }> {
    this.logger.log('Processando mensagem com IA');

    // 1. Transcrever
    const transcription = await this.transcribeAudio(audioUrl);

    // 2. Extrair dados
    const extraction = await this.extractContactData(transcription);

    return { transcription, extraction };
  }

  /**
   * Limpa o cache do client OpenAI (útil após atualizar API key)
   */
  clearCache(): void {
    this.openaiService.clearClient();
  }
}
