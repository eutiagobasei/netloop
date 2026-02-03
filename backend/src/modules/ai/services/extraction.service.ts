import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import {
  ExtractedContactData,
  ExtractionResult,
  ExtractionWithConnectionsResult,
  MentionedConnectionData,
} from '../dto/extracted-contact.dto';

export type MessageIntent = 'query' | 'contact_info' | 'update_contact' | 'other';

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(private readonly openaiService: OpenAIService) {}

  /**
   * Classifica a intenção da mensagem: query (busca), contact_info (cadastro) ou other
   */
  async classifyIntent(text: string): Promise<MessageIntent> {
    this.logger.log(`Classificando intenção: ${text.substring(0, 50)}...`);

    const client = await this.openaiService.getClient();

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Classifique a intenção da mensagem:
- "query": usuário quer BUSCAR informação sobre alguém (ex: "quem é João?", "o que sabe sobre Maria?", "me fala do Pedro", "conhece algum advogado?")
- "contact_info": usuário está INFORMANDO dados de um contato para cadastrar (ex: "João, advogado, SP", "Conheci Maria no evento X, ela trabalha com marketing")
- "update_contact": usuário quer ATUALIZAR dados de um contato existente (ex: "atualizar dados de João", "editar informações do Pedro", "corrigir o email da Maria", "mudar empresa do Carlos", "quero atualizar as informações de Mateus")
- "other": saudação, agradecimento, ou mensagem sem relação com contatos

Responda APENAS com: query, contact_info, update_contact ou other`,
          },
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

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Extraia o NOME da pessoa ou o ASSUNTO que o usuário está buscando.
Exemplos:
- "quem é o João?" → "João"
- "o que você sabe sobre Maria Silva?" → "Maria Silva"
- "me fala do Pedro" → "Pedro"
- "conhece algum advogado?" → "advogado"
- "tem alguém de marketing?" → "marketing"

Responda APENAS com o nome ou termo de busca, sem pontuação ou explicações. Se não conseguir identificar, responda "null".`,
          },
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
   * Extrai dados de contato simples (método original)
   */
  async extractContactData(text: string): Promise<ExtractionResult> {
    this.logger.log(`Extraindo dados de contato do texto: ${text.substring(0, 100)}...`);

    const client = await this.openaiService.getClient();

    const systemPrompt = `Você é um assistente especializado em extrair informações de contatos profissionais de textos em português.

Analise o texto fornecido e extraia as seguintes informações (se disponíveis):
- name: Nome completo da pessoa
- company: Nome da empresa onde trabalha
- position: Cargo ou função
- phone: Número de telefone (formato brasileiro)
- email: Endereço de email
- location: Cidade, estado ou país
- context: Um resumo de como/onde se conheceram ou o contexto do encontro
- tags: Lista de palavras-chave relevantes para categorizar (ex: "investidor", "tecnologia", "startup", "mentor", etc)

IMPORTANTE:
- Se uma informação não estiver clara no texto, não invente. Deixe o campo vazio ou null.
- O campo "context" deve ser um resumo útil do encontro/conversa.
- Tags devem ser palavras simples e relevantes para networking profissional.

Retorne APENAS um JSON válido com os campos acima. Não inclua explicações.`;

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

    const systemPrompt = `Extraia informações de contato do texto. Retorne apenas JSON puro.

Esquema:
{
  "contact": {
    "name": "string (nome completo)",
    "phone": "string|null (telefone formato brasileiro)",
    "email": "string|null",
    "company": "string|null (empresa)",
    "position": "string|null (cargo)",
    "location": "string|null (cidade/estado)",
    "tags": ["string"] (palavras-chave: eventos, interesses, áreas),
    "context": "string (resumo do encontro/conversa)"
  },
  "connections": [
    {
      "name": "string (nome da pessoa mencionada)",
      "about": "string (descrição/contexto sobre ela)",
      "tags": ["string"],
      "phone": "string|null"
    }
  ]
}

Regras:
- O "contact" é a pessoa PRINCIPAL sobre quem o texto fala
- "connections" são OUTRAS pessoas mencionadas que o contact conhece ou indicou
- Tags: eventos, interesses, áreas de atuação profissional
- Se não houver conexões mencionadas, retorne connections: []
- NÃO invente dados que não estejam explícitos no texto
- Campos ausentes devem ser null ou array vazio`;

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
}
