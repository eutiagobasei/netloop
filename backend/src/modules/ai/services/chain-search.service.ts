import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { SettingsService } from '../../settings/settings.service';
import { DEFAULT_PROMPTS } from '../constants/default-prompts';
import {
  ChainSearchParams,
  ChainSearchResult,
  ChainSearchContact,
} from '../dto/chain-search.dto';

@Injectable()
export class ChainSearchService {
  private readonly logger = new Logger(ChainSearchService.name);
  private readonly DEFAULT_MODEL = 'gpt-4o-mini';

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Processa busca com raciocínio em cadeia
   * Tenta encontrar matches diretos, indiretos (domínio relacionado) ou via 2º grau
   */
  async processChainSearch(params: ChainSearchParams): Promise<ChainSearchResult> {
    const { userQuery, contacts, secondDegreeContacts } = params;

    this.logger.log(
      `Chain search: "${userQuery}" with ${contacts.length} 1st degree, ${secondDegreeContacts?.length || 0} 2nd degree contacts`,
    );

    // Se não há contatos, retorna not_found imediatamente
    if (contacts.length === 0 && (!secondDegreeContacts || secondDegreeContacts.length === 0)) {
      return {
        matchType: 'not_found',
        contacts: [],
        message: 'Sua rede de contatos está vazia. Comece adicionando alguns contatos!',
        suggestion: 'Me envie um áudio ou texto com informações de alguém que você conheceu.',
      };
    }

    // Formata contatos para o prompt
    const contactsText = this.formatContactsForPrompt(contacts);
    const secondDegreeText = this.formatSecondDegreeForPrompt(secondDegreeContacts || []);

    // Busca prompt customizado ou usa padrão
    const promptTemplate = await this.getPrompt('chain_of_thought_search');

    // Substitui variáveis no prompt
    const prompt = promptTemplate
      .replace('{{userQuery}}', userQuery)
      .replace('{{contacts}}', contactsText || 'Nenhum contato de 1º grau disponível')
      .replace('{{secondDegreeContacts}}', secondDegreeText || 'Nenhum contato de 2º grau disponível');

    try {
      const client = await this.openaiService.getClient();
      const response = await client.chat.completions.create({
        model: this.DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content || '';
      const result = this.parseChainSearchResponse(content);

      this.logger.log(`Chain search result: ${result.matchType} - ${result.message}`);

      return result;
    } catch (error) {
      this.logger.error(`Chain search error: ${error.message}`);
      return {
        matchType: 'not_found',
        contacts: [],
        message: 'Desculpe, não consegui processar a busca no momento.',
        suggestion: 'Tente novamente em alguns instantes.',
      };
    }
  }

  /**
   * Formata contatos de 1º grau para o prompt
   */
  private formatContactsForPrompt(
    contacts: ChainSearchParams['contacts'],
  ): string {
    if (!contacts || contacts.length === 0) return '';

    return contacts
      .slice(0, 50) // Limita para não exceder tokens
      .map((c) => {
        const parts = [`- ID: ${c.id}`, `Nome: ${c.name}`];
        if (c.context) parts.push(`Contexto: ${c.context}`);
        if (c.notes) parts.push(`Notas: ${c.notes}`);
        if (c.phone) parts.push(`Telefone: ${c.phone}`);
        return parts.join(' | ');
      })
      .join('\n');
  }

  /**
   * Formata contatos de 2º grau para o prompt
   */
  private formatSecondDegreeForPrompt(
    contacts: NonNullable<ChainSearchParams['secondDegreeContacts']>,
  ): string {
    if (!contacts || contacts.length === 0) return '';

    return contacts
      .slice(0, 20) // Limita para não exceder tokens
      .map((c) => {
        // Formato claro: este é contato de 2º GRAU, precisa de PONTE para apresentação
        return `- [2º GRAU] Nome: ${c.name} | Área: ${c.area || 'não especificada'} | PONTE OBRIGATÓRIA: ${c.connectorName} (Tel: ${c.connectorPhone || 'sem tel'}, ID: ${c.connectorId})`;
      })
      .join('\n');
  }

  /**
   * Parseia a resposta da IA
   */
  private parseChainSearchResponse(response: string): ChainSearchResult {
    try {
      // Remove markdown code blocks se presentes
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
      }
      if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
      }
      cleanResponse = cleanResponse.trim();

      const parsed = JSON.parse(cleanResponse);

      // Valida e normaliza a resposta
      const result: ChainSearchResult = {
        matchType: this.validateMatchType(parsed.matchType),
        contacts: this.normalizeContacts(parsed.contacts || []),
        message: parsed.message || 'Busca processada.',
      };

      if (parsed.bridge) {
        result.bridge = {
          name: parsed.bridge.name || '',
          id: parsed.bridge.id || '',
          phone: parsed.bridge.phone || null,
        };
      }

      if (parsed.suggestion) {
        result.suggestion = parsed.suggestion;
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to parse chain search response: ${error.message}`);
      this.logger.debug(`Raw response: ${response}`);

      return {
        matchType: 'not_found',
        contacts: [],
        message: 'Não encontrei ninguém relevante para essa busca na sua rede.',
        suggestion: 'Tente uma busca diferente ou adicione mais contatos.',
      };
    }
  }

  /**
   * Valida o tipo de match
   */
  private validateMatchType(
    matchType: string,
  ): ChainSearchResult['matchType'] {
    const validTypes = ['direct', 'indirect_domain', 'bridge', 'not_found'];
    return validTypes.includes(matchType)
      ? (matchType as ChainSearchResult['matchType'])
      : 'not_found';
  }

  /**
   * Normaliza array de contatos
   */
  private normalizeContacts(contacts: any[]): ChainSearchContact[] {
    if (!Array.isArray(contacts)) return [];

    return contacts.map((c) => ({
      id: c.id || '',
      name: c.name || '',
      score: typeof c.score === 'number' ? c.score : 0,
      reason: c.reason || '',
      relationToQuery: c.relationToQuery,
      isSecondDegree: c.isSecondDegree === true,
      phone: c.phone,
    }));
  }

  /**
   * Busca prompt customizado ou usa padrão
   */
  private async getPrompt(key: string): Promise<string> {
    try {
      const setting = await this.settingsService.findByKey(`prompt_${key}`);
      if (setting?.value) {
        return setting.value;
      }
    } catch {
      // Usa prompt padrão se não encontrar customizado
    }
    return DEFAULT_PROMPTS[key as keyof typeof DEFAULT_PROMPTS] || '';
  }
}
