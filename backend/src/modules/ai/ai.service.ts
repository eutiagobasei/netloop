import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './services/openai.service';
import { TranscriptionService } from './services/transcription.service';
import {
  ExtractionService,
  MessageIntent,
  SmartSearchResult,
} from './services/extraction.service';
import { EmbeddingService } from './services/embedding.service';
import { LoopService } from './services/loop.service';
import { ExtractionResult } from './dto/extracted-contact.dto';
import { LoopPlanResponse } from './dto/loop.dto';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly transcriptionService: TranscriptionService,
    private readonly extractionService: ExtractionService,
    private readonly embeddingService: EmbeddingService,
    private readonly loopService: LoopService,
  ) {}

  /**
   * Verifica se a IA está configurada (API key presente)
   */
  async isConfigured(): Promise<boolean> {
    return this.openaiService.isConfigured();
  }

  /**
   * Transcreve um áudio usando Whisper (a partir de URL)
   */
  async transcribeAudio(audioUrl: string): Promise<string> {
    return this.transcriptionService.transcribeAudio(audioUrl);
  }

  /**
   * Transcreve um áudio usando Whisper (a partir de Buffer)
   */
  async transcribeFromBuffer(audioBuffer: Buffer): Promise<string> {
    return this.transcriptionService.transcribeFromBuffer(audioBuffer);
  }

  /**
   * Classifica a intenção da mensagem: query, contact_info ou other
   */
  async classifyIntent(text: string): Promise<MessageIntent> {
    return this.extractionService.classifyIntent(text);
  }

  /**
   * Extrai o nome/assunto de uma busca
   * @deprecated Use classifyAndExtract() para 50% menos chamadas de API
   */
  async extractQuerySubject(text: string): Promise<string | null> {
    return this.extractionService.extractQuerySubject(text);
  }

  /**
   * Classifica a intenção E extrai o assunto em UMA única chamada de API
   * Reduz 50% das chamadas de API comparado a classifyIntent + extractQuerySubject
   */
  async classifyAndExtract(
    text: string,
  ): Promise<{ intent: MessageIntent; subject: string | null }> {
    return this.extractionService.classifyAndExtract(text);
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

  /**
   * Gera resposta amigável para saudações e mensagens genéricas
   */
  async generateGreetingResponse(userName?: string): Promise<string> {
    return this.extractionService.generateGreetingResponse(userName);
  }

  /**
   * Classifica resposta do usuário no contexto de pedido de apresentação
   * @returns 'confirm' | 'reject' | 'other'
   */
  async classifyIntroResponse(
    userMessage: string,
    connectorName: string,
    area: string,
  ): Promise<'confirm' | 'reject' | 'other'> {
    return this.extractionService.classifyIntroResponse(userMessage, connectorName, area);
  }

  /**
   * Gera plano estratégico de networking do Loop
   */
  async generateLoopPlan(userId: string, goal: string): Promise<LoopPlanResponse> {
    return this.loopService.generatePlan(userId, goal);
  }

  /**
   * Extrai tags relevantes do contexto de um contato usando IA
   */
  async extractTagsFromContext(params: {
    context?: string;
    name?: string;
  }): Promise<string[]> {
    return this.extractionService.extractTagsFromContext(params);
  }

  /**
   * Detecta se uma query de busca é ambígua usando IA
   * Retorna opções de clarificação se o termo for ambíguo
   */
  async detectQueryAmbiguity(query: string): Promise<{
    isAmbiguous: boolean;
    reason?: string;
    options: Array<{ key: string; label: string; description: string }>;
  }> {
    return this.extractionService.detectQueryAmbiguity(query);
  }

  /**
   * Ranqueia contatos por relevância semântica para uma busca
   * Usa IA para determinar qual contato melhor atende à necessidade
   */
  async rankContactsByRelevance(
    query: string,
    contacts: Array<{ id: string; name: string; context?: string }>,
    clarification?: string,
  ): Promise<{
    rankings: Array<{ contactId: string; score: number; reason: string }>;
    bestMatch: string | null;
    suggestion?: string;
  }> {
    return this.extractionService.rankContactsByRelevance(query, contacts, clarification);
  }

  /**
   * MÉTODO UNIFICADO: Processamento inteligente de busca
   * Combina detecção de ambiguidade + ranking de relevância em uma única chamada IA
   */
  async processSmartSearch(params: {
    userName: string;
    userMessage: string;
    contacts: Array<{ id: string; name: string; context?: string; phone?: string }>;
    clarification?: string;
  }): Promise<SmartSearchResult> {
    return this.extractionService.processSmartSearch(params);
  }

  /**
   * Busca inteligente de contatos usando IA
   * A IA analisa a lista de contatos e encontra matches mesmo com variações de nome
   * Ex: "Mateus" encontra "Mattheus Pinheiro", "Felipe" encontra "Philippe"
   */
  async findContactByNameAI(
    searchName: string,
    contacts: Array<{ id: string; name: string; context?: string | null }>,
  ): Promise<{
    matches: Array<{ id: string; name: string; confidence: number; reason: string }>;
    noMatch: boolean;
    suggestion?: string;
  }> {
    return this.extractionService.findContactByNameAI(searchName, contacts);
  }
}
