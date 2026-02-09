import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { SettingsService } from '../../settings/settings.service';
import {
  ExtractedContactData,
  ExtractionResult,
  ExtractionWithConnectionsResult,
  MentionedConnectionData,
} from '../dto/extracted-contact.dto';

export type MessageIntent = 'query' | 'contact_info' | 'update_contact' | 'other';

export interface RegistrationResponseParams {
  userMessage: string;
  conversationHistory: Array<{ role: string; content: string }>;
  extractedData: { name?: string; email?: string; phoneConfirmed?: boolean };
  phoneFormatted?: string;
}

export interface RegistrationResponseResult {
  response: string;
  extracted: { name?: string; email?: string; phoneConfirmed?: boolean };
  isComplete: boolean;
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
  private async getPrompt(key: string, defaultPrompt: string): Promise<string> {
    try {
      const setting = await this.settingsService.getDecryptedValue(`prompt_${key}`);
      return setting || defaultPrompt;
    } catch {
      return defaultPrompt;
    }
  }

  /**
   * Prompts padrão (fallback se não estiverem no banco)
   */
  private readonly DEFAULT_PROMPTS = {
    intent_classification: `Classifique a intenção da mensagem:
- "query": usuário quer BUSCAR informação sobre alguém (ex: "quem é João?", "o que sabe sobre Maria?", "me fala do Pedro", "conhece algum advogado?")
- "contact_info": usuário está INFORMANDO dados de um contato para cadastrar. DEVE conter informações substanciais como: nome + empresa, nome + cargo, nome + contexto de como conheceu, etc. NÃO classifique como contact_info se for apenas um nome solto ou saudação.
- "update_contact": usuário quer ATUALIZAR dados de um contato existente (ex: "atualizar dados de João", "editar informações do Pedro", "corrigir o email da Maria")
- "other": saudação (oi, olá, bom dia), agradecimento, confirmação (ok, sim), ou mensagem sem informação de contato útil

IMPORTANTE: Mensagens como "Olá", "Opa", "Oi tudo bem?", "Bom dia", apenas um nome sem contexto, ou saudações em geral são SEMPRE "other".

Responda APENAS com: query, contact_info, update_contact ou other`,

    query_subject: `Extraia o NOME da pessoa ou o ASSUNTO que o usuário está buscando.
Exemplos:
- "quem é o João?" → "João"
- "o que você sabe sobre Maria Silva?" → "Maria Silva"
- "me fala do Pedro" → "Pedro"
- "conhece algum advogado?" → "advogado"
- "tem alguém de marketing?" → "marketing"

Responda APENAS com o nome ou termo de busca, sem pontuação ou explicações. Se não conseguir identificar, responda "null".`,

    contact_extraction: `Você é um assistente especializado em extrair informações de contatos profissionais de textos em português.

Analise o texto fornecido e extraia as seguintes informações (se disponíveis):
- name: Nome completo da pessoa (IMPORTANTE: incluir nome E sobrenome exatamente como mencionado. Ex: "João Silva", "Maria Santos", não apenas "João")
- company: Nome da empresa onde trabalha
- position: Cargo ou função
- phone: Número de telefone (formato brasileiro) - CAMPO OBRIGATÓRIO para salvar contato
- email: Endereço de email
- location: Cidade, estado ou país
- context: Um resumo de como/onde se conheceram ou o contexto do encontro
- tags: Lista de PONTOS DE CONEXÃO - inclua:
  * Lugares, eventos, grupos ou comunidades onde se conheceram (ex: "Em Adoração", "SIPAT 2024", "Igreja São Paulo")
  * Interesses e áreas de atuação profissional (ex: "investidor", "tecnologia", "podcast")

IMPORTANTE:
- O campo PHONE é OBRIGATÓRIO para salvar um contato - se não estiver no texto, retorne phone como null mas avise no contexto
- Normalize o telefone para apenas números se possível (ex: 5521987654321)
- Se uma informação não estiver clara no texto, não invente. Deixe o campo vazio ou null.
- O campo "context" deve ser um resumo útil do encontro/conversa.
- Tags devem priorizar ONDE/COMO se conheceram (pontos de conexão), seguido de interesses.
- Capture o nome EXATAMENTE como mencionado, incluindo sobrenome.

Retorne APENAS um JSON válido com os campos acima. Não inclua explicações.`,

    contact_with_connections: `Extraia informações de contato do texto. Retorne apenas JSON puro.

Esquema:
{
  "contact": {
    "name": "string (nome completo COM sobrenome, exatamente como mencionado)",
    "phone": "string|null (telefone formato brasileiro - OBRIGATÓRIO para salvar)",
    "email": "string|null",
    "company": "string|null (empresa)",
    "position": "string|null (cargo)",
    "location": "string|null (cidade/estado)",
    "tags": ["string"] (PONTOS DE CONEXÃO: lugares, eventos, grupos onde se conheceram + interesses. Ex: ["Em Adoração", "podcast", "investidor"]),
    "context": "string (resumo do encontro/conversa)"
  },
  "connections": [
    {
      "name": "string (nome completo da pessoa mencionada)",
      "about": "string (descrição/contexto sobre ela)",
      "tags": ["string"],
      "phone": "string|null"
    }
  ]
}

Regras:
- O "contact" é a pessoa PRINCIPAL sobre quem o texto fala
- NOME: Capture exatamente como mencionado, incluindo sobrenome (ex: "Ianne Higino", não "Ianne")
- PHONE: OBRIGATÓRIO para salvar um contato. Normalize para apenas números (ex: 5521987654321)
- TAGS: Priorize PONTOS DE CONEXÃO (onde/como se conheceram) + interesses profissionais
- "connections" são OUTRAS pessoas mencionadas que o contact conhece ou indicou
- Se não houver conexões mencionadas, retorne connections: []
- NÃO invente dados que não estejam explícitos no texto
- Campos ausentes devem ser null ou array vazio`,

    greeting_response: `Você é um assistente virtual amigável do NetLoop, um sistema de gerenciamento de contatos via WhatsApp.

Gere uma resposta curta e simpática para uma saudação do usuário.

FUNCIONALIDADES DO SISTEMA:
- Salvar contatos: usuário envia nome, telefone, email, etc.
- Buscar contatos: usuário pergunta "quem é João?" ou "me passa o contato do Carlos"
- Atualizar contatos existentes

REGRAS:
- Seja breve (máximo 3 linhas)
- Use tom amigável e profissional
- Mencione brevemente o que o sistema pode fazer
- {{userName}}
- Pode usar 1 emoji no máximo`,

    registration_response: `Você é o assistente do NetLoop, uma plataforma de networking que ajuda pessoas a organizar seus contatos profissionais.
Um novo usuário está se cadastrando via WhatsApp.

DADOS JÁ COLETADOS:
- Nome: {{name}}
- Telefone confirmado: {{phoneConfirmed}}
- Telefone detectado: {{phoneFormatted}}
- Email: {{email}}

REGRAS IMPORTANTES:
1. Seja conversacional e amigável, NUNCA robótico ou formal demais
2. Use linguagem natural e descontraída (pode usar "você", "a gente", etc)
3. Respostas curtas e diretas (máximo 2-3 frases)
4. Se for a primeira mensagem (saudação), apresente-se brevemente e pergunte o nome
5. APÓS ter o nome, peça confirmação do telefone mostrando o número formatado
6. Se usuário confirmar o telefone (sim, correto, isso, exato, etc), marque phoneConfirmed: true
7. Se usuário negar (não, errado, etc), peça para digitar o número correto
8. Só peça email DEPOIS de ter nome E telefone confirmado
9. Quando tiver TODOS (nome + telefone confirmado + email válido), confirme o cadastro com entusiasmo
10. Email deve ter formato válido (algo@algo.algo)
11. NÃO invente dados - só extraia o que o usuário realmente disse

FLUXO DE ESTADOS:
1. [Primeira mensagem] → Se apresentar e pedir nome
2. [TEM NOME] → Mostrar telefone detectado e pedir confirmação
3. [TELEFONE CONFIRMADO] → Pedir email
4. [COMPLETED] → Nome + Telefone + Email coletados

EXEMPLOS DE TOM:
- "Oi! Prazer, sou o assistente do NetLoop 👋 Como posso te chamar?"
- "Show, {{name}}! Detectei que seu número é {{phoneFormatted}}. Tá certo?"
- "Perfeito! Me passa seu email pra finalizar o cadastro?"
- "Pronto! Cadastro concluído! Agora é só me mandar áudios ou textos sobre pessoas que conheceu 🚀"

RESPONDA APENAS EM JSON VÁLIDO:
{
  "response": "Sua mensagem de resposta",
  "extracted": {
    "name": "nome extraído ou null se não encontrou",
    "email": "email extraído ou null se não encontrou",
    "phoneConfirmed": true/false
  },
  "isComplete": false
}

IMPORTANTE: isComplete só deve ser true quando TODOS (nome + telefone confirmado + email válido) estiverem coletados.`,
  };

  /**
   * Lista de saudações comuns que devem ser ignoradas
   */
  private readonly GREETINGS = [
    'oi', 'olá', 'ola', 'opa', 'e aí', 'eai', 'e ai', 'hey', 'hi', 'hello',
    'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'tudo bom', 'como vai',
    'fala', 'salve', 'eae', 'oie', 'oii', 'oiii', 'olar', 'hola',
    'obrigado', 'obrigada', 'valeu', 'vlw', 'thanks', 'brigado', 'brigada',
    'ok', 'blz', 'beleza', 'certo', 'entendi', 'show', 'top', 'massa',
    'sim', 'não', 'nao', 'yes', 'no', 'yep', 'nope',
  ];

  /**
   * Verifica se o texto é uma saudação simples
   */
  private isGreeting(text: string): boolean {
    const normalized = text.toLowerCase().trim()
      .replace(/[!?.,;:]+/g, '')  // Remove pontuação
      .replace(/\s+/g, ' ');       // Normaliza espaços

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
    const systemPrompt = await this.getPrompt(
      'intent_classification',
      this.DEFAULT_PROMPTS.intent_classification,
    );

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
      const validIntent = ['query', 'contact_info', 'update_contact', 'other'].includes(intent || '')
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
   */
  async extractQuerySubject(text: string): Promise<string | null> {
    this.logger.log(`Extraindo assunto da query: ${text.substring(0, 50)}...`);

    const client = await this.openaiService.getClient();
    const systemPrompt = await this.getPrompt(
      'query_subject',
      this.DEFAULT_PROMPTS.query_subject,
    );

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
    const systemPrompt = await this.getPrompt(
      'contact_extraction',
      this.DEFAULT_PROMPTS.contact_extraction,
    );

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
   * Extrai dados de contato + conexões mencionadas no texto
   */
  async extractWithConnections(text: string): Promise<ExtractionWithConnectionsResult> {
    this.logger.log(`Extraindo contato e conexões do texto: ${text.substring(0, 100)}...`);

    const client = await this.openaiService.getClient();
    const systemPrompt = await this.getPrompt(
      'contact_with_connections',
      this.DEFAULT_PROMPTS.contact_with_connections,
    );

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

      const parsed = JSON.parse(content);

      const contact: ExtractedContactData = {
        name: parsed.contact?.name || undefined,
        company: parsed.contact?.company || undefined,
        position: parsed.contact?.position || undefined,
        phone: parsed.contact?.phone || undefined,
        email: parsed.contact?.email || undefined,
        location: parsed.contact?.location || undefined,
        context: parsed.contact?.context || undefined,
        tags: parsed.contact?.tags || [],
      };

      const connections: MentionedConnectionData[] = (parsed.connections || []).map(
        (conn: any) => ({
          name: conn.name,
          about: conn.about || undefined,
          tags: conn.tags || [],
          phone: conn.phone || undefined,
        }),
      );

      this.logger.log(
        `Extraído: contato=${contact.name}, conexões=${connections.length}`,
      );

      return {
        success: true,
        contact,
        connections,
        rawResponse: content,
      };
    } catch (error) {
      this.logger.error(`Erro ao extrair dados: ${error.message}`);

      return {
        success: false,
        contact: {},
        connections: [],
        rawResponse: error.message,
      };
    }
  }

  /**
   * Gera resposta conversacional para o fluxo de registro
   * e extrai nome/email da conversa de forma natural
   * Agora inclui confirmação de telefone antes de pedir email
   */
  async generateRegistrationResponse(
    params: RegistrationResponseParams,
  ): Promise<RegistrationResponseResult> {
    const { userMessage, conversationHistory, extractedData, phoneFormatted } = params;

    this.logger.log(
      `Gerando resposta de registro. Dados atuais: ${JSON.stringify(extractedData)}`,
    );

    const client = await this.openaiService.getClient();

    // Busca prompt do banco e substitui placeholders
    let systemPrompt = await this.getPrompt(
      'registration_response',
      this.DEFAULT_PROMPTS.registration_response,
    );

    // Substitui placeholders com valores atuais
    systemPrompt = systemPrompt
      .replace(/\{\{name\}\}/g, extractedData.name || 'NÃO COLETADO')
      .replace(/\{\{phoneConfirmed\}\}/g, extractedData.phoneConfirmed ? 'SIM' : 'NÃO')
      .replace(/\{\{phoneFormatted\}\}/g, phoneFormatted || 'NÃO DISPONÍVEL')
      .replace(/\{\{email\}\}/g, extractedData.email || 'NÃO COLETADO');

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Adiciona histórico da conversa
    for (const msg of conversationHistory) {
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

      // Mescla dados extraídos com os existentes
      const mergedData = {
        name: result.extracted?.name || extractedData.name || undefined,
        email: result.extracted?.email || extractedData.email || undefined,
        phoneConfirmed: result.extracted?.phoneConfirmed || extractedData.phoneConfirmed || false,
      };

      // Valida email se extraído
      if (mergedData.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(mergedData.email)) {
          mergedData.email = undefined;
        }
      }

      // Verifica se está completo (tem nome, telefone confirmado e email válido)
      const isComplete = !!(mergedData.name && mergedData.phoneConfirmed && mergedData.email);

      this.logger.log(
        `Resposta gerada. Dados extraídos: ${JSON.stringify(mergedData)}, completo: ${isComplete}`,
      );

      return {
        response: result.response || 'Oi! Como posso te ajudar com o cadastro?',
        extracted: mergedData,
        isComplete,
      };
    } catch (error) {
      this.logger.error(`Erro ao gerar resposta de registro: ${error.message}`);

      // Fallback para resposta genérica
      if (!extractedData.name) {
        return {
          response: 'Oi! Sou o assistente do NetLoop. Como posso te chamar?',
          extracted: {},
          isComplete: false,
        };
      }

      if (!extractedData.email) {
        return {
          response: `Oi, ${extractedData.name}! Me passa seu email pra finalizar o cadastro?`,
          extracted: { name: extractedData.name },
          isComplete: false,
        };
      }

      return {
        response: 'Desculpa, tive um problema. Pode repetir?',
        extracted: extractedData,
        isComplete: false,
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
    let systemPrompt = await this.getPrompt(
      'greeting_response',
      this.DEFAULT_PROMPTS.greeting_response,
    );

    // Substitui placeholder de userName
    const userNameText = userName
      ? `O nome do usuário é ${userName}`
      : 'Não sabemos o nome do usuário ainda';
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
}
