import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { SettingsService } from '../../settings/settings.service';
import { ExtractedContactData, ExtractionResult } from '../dto/extracted-contact.dto';
import { DEFAULT_PROMPTS, AI_CONFIG, PromptKey } from '../constants/default-prompts';

export type MessageIntent =
  | 'query'
  | 'contact_info'
  | 'update_contact'
  | 'memory'
  | 'register_intent'
  | 'other';

export interface RegistrationResponseParams {
  userMessage: string;
  conversationHistory: Array<{ role: string; content: string }>;
  extractedData: {
    name?: string;
    email?: string;
    phoneConfirmed?: boolean;
    objective?: string;
  };
  phoneFormatted?: string;
}

export interface RegistrationResponseResult {
  response: string;
  extracted: {
    name?: string;
    email?: string;
    phoneConfirmed?: boolean;
    objective?: string;
  };
  isComplete: boolean;
  nextAction?: 'ask_name' | 'ask_email' | 'ask_objective' | 'complete' | 'continue_chat';
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Obtém um prompt do banco de dados ou retorna o padrão
   */
  private async getPrompt(key: PromptKey): Promise<string> {
    try {
      const setting = await this.settingsService.getDecryptedValue(`prompt_${key}`);
      return setting || DEFAULT_PROMPTS[key];
    } catch {
      return DEFAULT_PROMPTS[key];
    }
  }

  /**
   * Lista de saudações comuns que devem ser ignoradas
   */
  private readonly GREETINGS = [
    'oi',
    'olá',
    'ola',
    'opa',
    'e aí',
    'eai',
    'e ai',
    'hey',
    'hi',
    'hello',
    'bom dia',
    'boa tarde',
    'boa noite',
    'tudo bem',
    'tudo bom',
    'como vai',
    'fala',
    'salve',
    'eae',
    'oie',
    'oii',
    'oiii',
    'olar',
    'hola',
    'obrigado',
    'obrigada',
    'valeu',
    'vlw',
    'thanks',
    'brigado',
    'brigada',
    'ok',
    'blz',
    'beleza',
    'certo',
    'entendi',
    'show',
    'top',
    'massa',
    'sim',
    'não',
    'nao',
    'yes',
    'no',
    'yep',
    'nope',
  ];

  /**
   * Verifica se o texto é uma saudação simples
   */
  private isGreeting(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .trim()
      .replace(/[!?.,;:]+/g, '') // Remove pontuação
      .replace(/\s+/g, ' '); // Normaliza espaços

    // Verifica se é exatamente uma saudação
    if (this.GREETINGS.includes(normalized)) {
      return true;
    }

    // Verifica se começa com saudação e tem menos de 4 palavras
    const words = normalized.split(' ');
    if (words.length <= 3 && this.GREETINGS.includes(words[0])) {
      return true;
    }

    return false;
  }

  /**
   * Classifica a intenção da mensagem: query (busca), contact_info (cadastro) ou other
   */
  async classifyIntent(text: string): Promise<MessageIntent> {
    this.logger.log(`Classificando intenção: ${text.substring(0, 50)}...`);

    // Primeiro verifica se é uma saudação simples (antes de chamar a IA)
    if (this.isGreeting(text)) {
      this.logger.log(`Mensagem identificada como saudação: "${text}"`);
      return 'other';
    }

    // Mensagens muito curtas (menos de 10 caracteres) provavelmente não são dados de contato
    if (text.trim().length < 10) {
      this.logger.log(`Mensagem muito curta para ser dados de contato: "${text}"`);
      return 'other';
    }

    const client = await this.openaiService.getClient();
    const systemPrompt = await this.getPrompt('intent_classification');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 20,
      });

      const intent = response.choices[0]?.message?.content?.trim().toLowerCase();
      const validIntent = [
        'query',
        'contact_info',
        'update_contact',
        'memory',
        'register_intent',
        'other',
      ].includes(intent || '')
        ? (intent as MessageIntent)
        : 'other';

      this.logger.log(`Intenção classificada: ${validIntent}`);
      return validIntent;
    } catch (error) {
      this.logger.error(`Erro ao classificar intenção: ${error.message}`);
      return 'other';
    }
  }

  /**
   * Extrai o nome/assunto da busca quando a intenção é query
   * @deprecated Use classifyAndExtract() para 50% menos chamadas de API
   */
  async extractQuerySubject(text: string): Promise<string | null> {
    this.logger.log(`Extraindo assunto da query: ${text.substring(0, 50)}...`);

    const client = await this.openaiService.getClient();
    const systemPrompt = await this.getPrompt('query_subject');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 50,
      });

      const result = response.choices[0]?.message?.content?.trim();
      const subject = result === 'null' || !result ? null : result;

      this.logger.log(`Assunto extraído: ${subject}`);
      return subject;
    } catch (error) {
      this.logger.error(`Erro ao extrair assunto: ${error.message}`);
      return null;
    }
  }

  /**
   * Classifica a intenção E extrai o assunto em UMA única chamada de API
   * Reduz 50% das chamadas de API comparado a classifyIntent + extractQuerySubject
   *
   * @returns {intent, subject} - intent é a classificação, subject é o termo de busca (se query)
   */
  async classifyAndExtract(
    text: string,
  ): Promise<{ intent: MessageIntent; subject: string | null }> {
    this.logger.log(`Classificando e extraindo: ${text.substring(0, 50)}...`);

    // Fast path: saudações simples não precisam de API
    if (this.isGreeting(text)) {
      this.logger.log(`Mensagem identificada como saudação: "${text}"`);
      return { intent: 'other', subject: null };
    }

    // Mensagens muito curtas provavelmente não são dados de contato
    if (text.trim().length < 10) {
      this.logger.log(`Mensagem muito curta para ser dados de contato: "${text}"`);
      return { intent: 'other', subject: null };
    }

    const client = await this.openaiService.getClient();
    const systemPrompt = await this.getPrompt('intent_and_subject');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 80,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Resposta vazia do modelo');
      }

      const result = JSON.parse(content);
      const validIntents = [
        'query',
        'contact_info',
        'update_contact',
        'memory',
        'register_intent',
        'other',
      ];
      const intent = validIntents.includes(result.intent)
        ? (result.intent as MessageIntent)
        : 'other';
      const subject = result.subject && result.subject !== 'null' ? result.subject : null;

      this.logger.log(`Classificado: intent=${intent}, subject=${subject}`);
      return { intent, subject };
    } catch (error) {
      this.logger.error(`Erro ao classificar e extrair: ${error.message}`);
      return { intent: 'other', subject: null };
    }
  }

  /**
   * Valida se o nome extraído é válido (não é saudação)
   */
  private isValidContactName(name: string | undefined): boolean {
    if (!name) return false;

    const normalized = name.toLowerCase().trim();

    // Verifica se é uma saudação
    if (this.GREETINGS.includes(normalized)) {
      return false;
    }

    // Nome muito curto (menos de 2 caracteres)
    if (normalized.length < 2) {
      return false;
    }

    // Nome que parece ser uma saudação no início de uma frase
    const firstWord = normalized.split(' ')[0];
    if (this.GREETINGS.includes(firstWord) && normalized.split(' ').length <= 2) {
      return false;
    }

    return true;
  }

  /**
   * Extrai dados de contato simples (método original)
   */
  async extractContactData(text: string): Promise<ExtractionResult> {
    this.logger.log(`Extraindo dados de contato do texto: ${text.substring(0, 100)}...`);

    const client = await this.openaiService.getClient();
    const systemPrompt = await this.getPrompt('contact_extraction');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Resposta vazia do modelo');
      }

      const data: ExtractedContactData = JSON.parse(content);

      this.logger.log(`Dados extraídos: ${JSON.stringify(data)}`);

      // Valida se o nome não é uma saudação
      if (!this.isValidContactName(data.name)) {
        this.logger.warn(`Nome inválido ou saudação detectada: "${data.name}"`);
        return {
          success: false,
          data: {},
          rawResponse: content,
        };
      }

      return {
        success: true,
        data,
        rawResponse: content,
      };
    } catch (error) {
      this.logger.error(`Erro ao extrair dados: ${error.message}`);

      return {
        success: false,
        data: {},
        rawResponse: error.message,
      };
    }
  }

  /**
   * Gera resposta conversacional para o fluxo de onboarding SDR
   * Conversa natural para coletar nome/email e entender objetivo do lead
   */
  async generateRegistrationResponse(
    params: RegistrationResponseParams,
  ): Promise<RegistrationResponseResult> {
    const { userMessage, conversationHistory, extractedData, phoneFormatted } = params;

    this.logger.log(
      `[Onboarding] Gerando resposta. Dados atuais: ${JSON.stringify(extractedData)}`,
    );

    const client = await this.openaiService.getClient();

    // Busca prompt do banco e substitui placeholders
    let systemPrompt = await this.getPrompt('registration_response');

    // Formata histórico da conversa para contexto
    const historyText =
      conversationHistory.length > 0
        ? conversationHistory
            .map((m) => `${m.role === 'user' ? 'Lead' : 'Loop'}: ${m.content}`)
            .join('\n')
        : 'Primeira mensagem do lead';

    // Substitui placeholders com valores atuais
    systemPrompt = systemPrompt
      .replace(/\{\{conversationHistory\}\}/g, historyText)
      .replace(/\{\{name\}\}/g, extractedData.name || 'NÃO COLETADO')
      .replace(/\{\{phoneConfirmed\}\}/g, 'SIM') // Sempre confirmado via WhatsApp
      .replace(/\{\{phoneFormatted\}\}/g, phoneFormatted || 'detectado do WhatsApp')
      .replace(/\{\{email\}\}/g, extractedData.email || 'NÃO COLETADO')
      .replace(/\{\{objective\}\}/g, extractedData.objective || 'NÃO IDENTIFICADO');

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Adiciona histórico da conversa (últimas 6 mensagens para não sobrecarregar)
    const recentHistory = conversationHistory.slice(-6);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Adiciona mensagem atual
    messages.push({ role: 'user', content: userMessage });

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Resposta vazia do modelo');
      }

      const result = JSON.parse(content);

      // Mescla dados extraídos com os existentes (prioriza novos dados)
      const mergedData = {
        name: result.extracted?.name || extractedData.name || undefined,
        email: result.extracted?.email || extractedData.email || undefined,
        phoneConfirmed: true, // Sempre true via WhatsApp
        objective: result.extracted?.objective || extractedData.objective || undefined,
      };

      // Valida e normaliza email se extraído
      if (mergedData.email) {
        const emailLower = mergedData.email.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailLower)) {
          mergedData.email = undefined;
        } else {
          mergedData.email = emailLower;
        }
      }

      // Verifica se está completo (tem nome e email válido)
      const isComplete = !!(mergedData.name && mergedData.email);

      this.logger.log(
        `[Onboarding] Resposta gerada. Dados: ${JSON.stringify(mergedData)}, completo: ${isComplete}`,
      );

      return {
        response: result.response || 'Oi! Sou o Loop, seu assistente de networking 🧠',
        extracted: mergedData,
        isComplete,
        nextAction: result.nextAction || 'continue_chat',
      };
    } catch (error) {
      this.logger.error(`[Onboarding] Erro ao gerar resposta: ${error.message}`);

      // Fallback conversacional
      if (!extractedData.name) {
        return {
          response: 'Oi! Sou o Loop, seu assistente de networking 🧠 Como posso te chamar?',
          extracted: { phoneConfirmed: true },
          isComplete: false,
          nextAction: 'ask_name',
        };
      }

      if (!extractedData.email) {
        return {
          response: `Prazer, ${extractedData.name}! Me passa seu email pra criar seu acesso?`,
          extracted: { name: extractedData.name, phoneConfirmed: true },
          isComplete: false,
          nextAction: 'ask_email',
        };
      }

      return {
        response: 'Desculpa, tive um problema. Pode repetir?',
        extracted: { ...extractedData, phoneConfirmed: true },
        isComplete: false,
        nextAction: 'continue_chat',
      };
    }
  }

  /**
   * Gera resposta amigável para saudações e mensagens genéricas
   */
  async generateGreetingResponse(userName?: string): Promise<string> {
    this.logger.log(`Gerando resposta de saudação para usuário: ${userName || 'desconhecido'}`);

    const client = await this.openaiService.getClient();

    // Busca prompt do banco e substitui placeholder
    let systemPrompt = await this.getPrompt('greeting_response');

    // Substitui placeholder de userName
    const userNameText = userName
      ? `O nome do usuário é ${userName}. Use o nome na saudação.`
      : 'Não sabemos o nome do usuário ainda. Não use nome na saudação.';
    systemPrompt = systemPrompt.replace(/\{\{userName\}\}/g, userNameText);

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Gere uma saudação de boas-vindas' },
        ],
        temperature: 0.7,
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content;
      return content || 'Olá! Como posso ajudar?';
    } catch (error) {
      this.logger.error(`Erro ao gerar resposta de saudação: ${error.message}`);
      return 'Olá! Como posso ajudar?';
    }
  }

  /**
   * Gera resposta formatada para resultados de busca
   */
  async generateSearchResponse(params: {
    searchTerm: string;
    contacts: Array<{
      name: string;
      company?: string;
      position?: string;
      phone?: string;
      context?: string;
    }>;
  }): Promise<string> {
    const { searchTerm, contacts } = params;
    this.logger.log(`Gerando resposta de busca para: ${searchTerm}, ${contacts.length} resultados`);

    const client = await this.openaiService.getClient();

    let systemPrompt = await this.getPrompt('search_response');

    // Substitui placeholders
    systemPrompt = systemPrompt
      .replace(/\{\{searchTerm\}\}/g, searchTerm)
      .replace(/\{\{resultCount\}\}/g, contacts.length.toString())
      .replace(/\{\{contacts\}\}/g, JSON.stringify(contacts, null, 2));

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Formate a resposta de busca' },
        ],
        temperature: 0.5,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      return content || `Encontrei ${contacts.length} contato(s) para "${searchTerm}".`;
    } catch (error) {
      this.logger.error(`Erro ao gerar resposta de busca: ${error.message}`);
      return `Encontrei ${contacts.length} contato(s) para "${searchTerm}".`;
    }
  }

  /**
   * Gera confirmação de salvamento de contato
   */
  async generateSaveConfirmation(contact: {
    name: string;
    company?: string;
    position?: string;
    phone?: string;
    email?: string;
    context?: string;
    tags?: string[];
  }): Promise<string> {
    this.logger.log(`Gerando confirmação de salvamento para: ${contact.name}`);

    const client = await this.openaiService.getClient();

    let systemPrompt = await this.getPrompt('save_confirmation');

    // Substitui placeholders
    systemPrompt = systemPrompt
      .replace(/\{\{name\}\}/g, contact.name || '')
      .replace(/\{\{company\}\}/g, '')
      .replace(/\{\{position\}\}/g, '')
      .replace(/\{\{phone\}\}/g, contact.phone || 'não informado')
      .replace(/\{\{email\}\}/g, contact.email || 'não informado')
      .replace(/\{\{context\}\}/g, contact.context || 'não informado')
      .replace(/\{\{tags\}\}/g, contact.tags?.join(', ') || 'nenhuma');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Confirme o salvamento' },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      return content || `✅ Contato de ${contact.name} salvo com sucesso!`;
    } catch (error) {
      this.logger.error(`Erro ao gerar confirmação: ${error.message}`);
      return `✅ Contato de ${contact.name} salvo com sucesso!`;
    }
  }

  /**
   * Gera resposta de erro amigável
   */
  async generateErrorResponse(errorType: string, errorDetails?: string): Promise<string> {
    this.logger.log(`Gerando resposta de erro: ${errorType}`);

    const client = await this.openaiService.getClient();

    let systemPrompt = await this.getPrompt('error_response');

    // Substitui placeholders
    systemPrompt = systemPrompt
      .replace(/\{\{errorType\}\}/g, errorType)
      .replace(/\{\{errorDetails\}\}/g, errorDetails || 'Sem detalhes adicionais');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Gere uma mensagem de erro amigável' },
        ],
        temperature: 0.5,
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content;
      return content || 'Desculpe, ocorreu um erro. Pode tentar novamente?';
    } catch (error) {
      this.logger.error(`Erro ao gerar resposta de erro: ${error.message}`);
      return 'Desculpe, ocorreu um erro. Pode tentar novamente?';
    }
  }

  /**
   * Gera pergunta sobre contexto/dados faltantes do contato
   */
  async generateContextQuestion(params: {
    name: string;
    phone?: string;
    missingFields: string[];
  }): Promise<string> {
    const { name, phone, missingFields } = params;
    this.logger.log(
      `Gerando pergunta de contexto para: ${name}, faltando: ${missingFields.join(', ')}`,
    );

    const client = await this.openaiService.getClient();

    let systemPrompt = await this.getPrompt('context_question');

    // Substitui placeholders
    systemPrompt = systemPrompt
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{phone\}\}/g, phone || 'não informado')
      .replace(/\{\{missingFields\}\}/g, missingFields.join(', '));

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Pergunte sobre o dado faltante' },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      const content = response.choices[0]?.message?.content;
      return content || `Salvei ${name}! Onde vocês se conheceram?`;
    } catch (error) {
      this.logger.error(`Erro ao gerar pergunta de contexto: ${error.message}`);
      return `Salvei ${name}! Onde vocês se conheceram?`;
    }
  }

  /**
   * Gera confirmação de atualização de contato
   */
  async generateUpdateConfirmation(params: {
    name: string;
    field: string;
    oldValue: string;
    newValue: string;
  }): Promise<string> {
    const { name, field, oldValue, newValue } = params;
    this.logger.log(`Gerando confirmação de atualização: ${name}, ${field}`);

    const client = await this.openaiService.getClient();

    let systemPrompt = await this.getPrompt('update_confirmation');

    // Substitui placeholders
    systemPrompt = systemPrompt
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{field\}\}/g, field)
      .replace(/\{\{oldValue\}\}/g, oldValue || 'não informado')
      .replace(/\{\{newValue\}\}/g, newValue);

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Confirme a atualização' },
        ],
        temperature: 0.5,
        max_tokens: 100,
      });

      const content = response.choices[0]?.message?.content;
      return content || `✅ ${field} de ${name} atualizado!`;
    } catch (error) {
      this.logger.error(`Erro ao gerar confirmação de atualização: ${error.message}`);
      return `✅ ${field} de ${name} atualizado!`;
    }
  }

  /**
   * Extrai tags relevantes do contexto de um contato usando IA
   */
  async extractTagsFromContext(params: {
    context?: string;
    name?: string;
    company?: string;
    position?: string;
  }): Promise<string[]> {
    const { context, name, company, position } = params;

    // Se não tem contexto nem cargo nem empresa, não tem o que extrair
    if (!context && !company && !position) {
      this.logger.log('Sem contexto para extrair tags');
      return [];
    }

    this.logger.log(`Extraindo tags do contexto: ${context?.substring(0, 50)}...`);

    const client = await this.openaiService.getClient();
    let systemPrompt = await this.getPrompt('tag_extraction');

    // Substitui placeholders
    systemPrompt = systemPrompt
      .replace(/\{\{context\}\}/g, context || '')
      .replace(/\{\{name\}\}/g, name || '')
      .replace(/\{\{company\}\}/g, company || '')
      .replace(/\{\{position\}\}/g, position || '');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extraia as tags do contexto fornecido.` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        this.logger.warn('Resposta vazia na extração de tags');
        return [];
      }

      const result = JSON.parse(content);
      const tags = Array.isArray(result.tags) ? result.tags : [];

      // Normaliza e valida tags
      const normalizedTags = tags
        .map((tag: string) => this.normalizeTag(tag))
        .filter((tag: string) => tag.length >= 2 && tag.length <= 50);

      this.logger.log(`Tags extraídas: ${normalizedTags.join(', ')}`);
      return normalizedTags.slice(0, 5); // Máximo 5 tags
    } catch (error) {
      this.logger.error(`Erro ao extrair tags: ${error.message}`);
      return [];
    }
  }

  /**
   * Normaliza uma tag: lowercase, sem acentos, espaços viram hífens
   */
  private normalizeTag(tag: string): string {
    return tag
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-') // Espaços viram hífens
      .replace(/-+/g, '-') // Remove hífens duplicados
      .replace(/^-|-$/g, ''); // Remove hífens no início/fim
  }

  /**
   * Classifica a resposta do usuário no contexto de um pedido de apresentação
   * Contexto: Sistema perguntou "Quer que eu peça uma apresentação?" para conectar
   * com alguém de uma área específica via um contato de 1º grau
   */
  async classifyIntroResponse(
    userMessage: string,
    connectorName: string,
    area: string,
  ): Promise<'confirm' | 'reject' | 'other'> {
    this.logger.log(
      `Classificando resposta de intro: "${userMessage}" (conector: ${connectorName}, área: ${area})`,
    );

    const client = await this.openaiService.getClient();

    const systemPrompt = `Você está analisando a resposta de um usuário em um contexto específico.

CONTEXTO:
O sistema acabou de informar que "${connectorName}" pode conectar o usuário com alguém de "${area}".
O sistema perguntou: "Quer que eu peça uma apresentação?"

TAREFA:
Classifique a resposta do usuário em UMA das categorias:

- "confirm": O usuário QUER a apresentação (sim, quero, pode, por favor, bora, manda, fechou, etc.)
- "reject": O usuário NÃO quer a apresentação (não, deixa, não precisa, talvez depois, etc.)
- "other": O usuário mudou de assunto ou a mensagem não é relacionada à pergunta

EXEMPLOS:
- "sim" → confirm
- "quero" → confirm
- "pode pedir" → confirm
- "por favor!" → confirm
- "bora" → confirm
- "manda ver" → confirm
- "não" → reject
- "deixa pra lá" → reject
- "agora não" → reject
- "quem é João?" → other
- "salva esse contato" → other
- "oi" → other

Responda APENAS com: confirm, reject ou other`;

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 10,
      });

      const result = response.choices[0]?.message?.content?.trim().toLowerCase();
      const validResults = ['confirm', 'reject', 'other'];
      const classification = validResults.includes(result || '')
        ? (result as 'confirm' | 'reject' | 'other')
        : 'other';

      this.logger.log(`Classificação de intro: ${classification}`);
      return classification;
    } catch (error) {
      this.logger.error(`Erro ao classificar resposta de intro: ${error.message}`);
      return 'other';
    }
  }
}
