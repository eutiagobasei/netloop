import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { AIService } from '../ai/ai.service';
import { ExtractionResult } from '../ai/dto/extracted-contact.dto';
import { PhoneUtil } from '../../common/utils/phone.util';
import { SearchCacheService } from './search-cache.service';

// Tipos para resposta de busca
export interface SearchResult {
  type: 'direto' | 'ponte' | 'nenhum' | 'ambiguous';
  data: any[];
  message: string;
  suggestions?: string[]; // Nomes similares encontrados
  query?: string; // Query original para contexto
  disambiguation?: {
    term: string;
    options: Array<{ key: string; label: string; description: string }>;
  };
}

interface ContactWithSimilarity {
  id: string;
  name: string;
  location: string | null;
  context: string | null;
  phone: string | null;
  email: string | null;
  similarity: number;
}

interface MentionedConnectionWithContact {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  phone: string | null;
  contactId: string;
  contact: {
    id: string;
    name: string;
  };
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AIService))
    private readonly aiService: AIService,
    private readonly searchCache: SearchCacheService,
  ) {}

  // ============================================
  // NORMALIZAÇÃO E SIMILARIDADE DE NOMES
  // ============================================

  /**
   * Normaliza string para comparação (remove acentos, lowercase, variações)
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/ph/gi, 'f') // ph → f (Philippe → Felipe)
      .replace(/th(?=[aeiou])/gi, 't') // th antes de vogal → t (Matheus → Mateus)
      .replace(/y/gi, 'i') // y → i (Thaysa → Taisa)
      .replace(/w/gi, 'v') // w → v (Wagner → Vagner)
      .replace(/\s+/g, ' ') // Múltiplos espaços → único
      .trim();
  }

  /**
   * Calcula distância de Levenshtein entre duas strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j - 1] + 1, // substituição
            dp[i - 1][j] + 1, // deleção
            dp[i][j - 1] + 1, // inserção
          );
        }
      }
    }
    return dp[m][n];
  }

  /**
   * Calcula similaridade entre duas strings (0 a 1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = this.normalizeString(str1);
    const s2 = this.normalizeString(str2);

    // Se normalizado é igual, 100% similar
    if (s1 === s2) return 1;

    // Se um contém o outro, alta similaridade
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Busca nomes similares na base de contatos
   * OTIMIZADO: Usa pg_trgm para fuzzy search no banco ao invés de carregar todos os contatos
   */
  private async findSimilarNames(
    ownerId: string,
    searchName: string,
    threshold = 0.3, // pg_trgm threshold (0.3 é mais permissivo que 0.6 Levenshtein)
  ): Promise<{ name: string; similarity: number }[]> {
    const results = await this.prisma.$queryRaw<{ name: string; similarity: number }[]>`
      SELECT name, similarity(name, ${searchName}) as similarity
      FROM contacts
      WHERE "ownerId" = ${ownerId}
        AND similarity(name, ${searchName}) >= ${threshold}
        AND similarity(name, ${searchName}) < 1
      ORDER BY similarity(name, ${searchName}) DESC
      LIMIT 5
    `;

    return results;
  }

  async create(ownerId: string, dto: CreateContactDto) {
    const { tagIds, ...contactData } = dto;

    // Valida e normaliza telefone (obrigatório)
    const normalizedPhone = PhoneUtil.normalize(contactData.phone);
    if (!normalizedPhone) {
      throw new BadRequestException(
        'Telefone inválido. Use formato brasileiro: 21987654321 ou +5521987654321',
      );
    }

    // Verifica duplicata por telefone normalizado
    const existingByPhone = await this.prisma.contact.findFirst({
      where: { ownerId, phone: normalizedPhone },
    });

    if (existingByPhone) {
      throw new ConflictException(
        `Já existe um contato com este telefone: ${existingByPhone.name}`,
      );
    }

    const contact = await this.prisma.contact.create({
      data: {
        ...contactData,
        phone: normalizedPhone,
        ownerId,
        tags: tagIds?.length
          ? {
              create: tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
          : undefined,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    // Gerar embedding de forma assíncrona (não bloqueia a resposta)
    this.generateEmbeddingForContact(contact.id, contactData);

    // Extrair e atribuir tags automaticamente se tiver contexto
    if (contactData.context) {
      this.extractAndAssignTags(ownerId, contact.id, contactData).catch((err) =>
        this.logger.error(`Erro ao extrair tags: ${err.message}`),
      );
    }

    // Invalidate search cache for this user (new contact may affect search results)
    this.searchCache.invalidateForUser(ownerId);

    return this.formatContactResponse(contact);
  }

  /**
   * Gera embedding para um contato de forma assíncrona
   * Usa apenas name + context como base para busca semântica
   */
  private async generateEmbeddingForContact(
    contactId: string,
    contactData: Partial<CreateContactDto>,
  ) {
    try {
      const isConfigured = await this.aiService.isConfigured();
      if (!isConfigured) {
        this.logger.warn('IA não configurada, pulando geração de embedding');
        return;
      }

      // Concatena informações relevantes para o embedding - simplificado para name + context
      const textParts = [
        contactData.name,
        contactData.context,
        contactData.notes,
        contactData.location,
      ].filter(Boolean);

      if (textParts.length === 0) {
        return;
      }

      const text = textParts.join(' ');
      this.logger.log(`Gerando embedding para contato ${contactId}`);

      const embedding = await this.aiService.generateEmbedding(text);

      // Atualiza o contato com o embedding usando raw query (pgvector)
      await this.prisma.$executeRaw`
        UPDATE contacts SET embedding = ${embedding}::vector WHERE id = ${contactId}
      `;

      this.logger.log(`Embedding gerado para contato ${contactId}`);
    } catch (error) {
      this.logger.error(`Erro ao gerar embedding para contato ${contactId}:`, error);
    }
  }

  async findAll(ownerId: string, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where = {
      ownerId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { context: { contains: search, mode: 'insensitive' as const } },
          { notes: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take: limit,
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      data: contacts.map(this.formatContactResponse),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string, ownerId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        connections: true,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contato não encontrado');
    }

    if (contact.ownerId !== ownerId) {
      throw new ForbiddenException('Sem permissão para acessar este contato');
    }

    return this.formatContactResponse(contact);
  }

  async update(id: string, ownerId: string, dto: UpdateContactDto) {
    await this.findById(id, ownerId);

    const { tagIds, ...contactData } = dto;

    // Se tagIds foi fornecido, atualiza as tags
    if (tagIds !== undefined) {
      // Valida que todas as tags pertencem ao usuário
      if (tagIds.length > 0) {
        const validTags = await this.prisma.tag.findMany({
          where: {
            id: { in: tagIds },
            createdById: ownerId,
          },
          select: { id: true },
        });

        const validTagIds = validTags.map((t) => t.id);
        const invalidTagIds = tagIds.filter((id) => !validTagIds.includes(id));

        if (invalidTagIds.length > 0) {
          throw new ForbiddenException('Uma ou mais tags não pertencem a você');
        }
      }

      // Remove todas as tags existentes
      await this.prisma.contactTag.deleteMany({
        where: { contactId: id },
      });

      // Adiciona as novas tags
      if (tagIds.length > 0) {
        await this.prisma.contactTag.createMany({
          data: tagIds.map((tagId) => ({
            contactId: id,
            tagId,
          })),
        });
      }
    }

    const contact = await this.prisma.contact.update({
      where: { id },
      data: contactData,
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    // Regenerar embedding se campos relevantes foram atualizados
    const relevantFields = ['name', 'location', 'context', 'notes'];
    const hasRelevantChange = relevantFields.some(
      (field) => dto[field as keyof UpdateContactDto] !== undefined,
    );

    if (hasRelevantChange) {
      this.generateEmbeddingForContact(id, {
        name: contact.name,
        location: contact.location || undefined,
        context: contact.context || undefined,
        notes: contact.notes || undefined,
      });
    }

    // Invalidate search cache for this user (updated contact may affect search results)
    this.searchCache.invalidateForUser(ownerId);

    return this.formatContactResponse(contact);
  }

  async delete(id: string, ownerId: string) {
    await this.findById(id, ownerId);

    await this.prisma.contact.delete({
      where: { id },
    });

    // Invalidate search cache for this user
    this.searchCache.invalidateForUser(ownerId);
  }

  async findByTag(ownerId: string, tagId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: {
        ownerId,
        tags: {
          some: {
            tagId,
          },
        },
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    return contacts.map(this.formatContactResponse);
  }

  /**
   * Busca semântica de contatos usando embeddings
   */
  async searchSemantic(ownerId: string, query: string, limit = 10) {
    try {
      const isConfigured = await this.aiService.isConfigured();
      if (!isConfigured) {
        this.logger.warn('IA não configurada, usando busca tradicional');
        return this.findAll(ownerId, 1, limit, query);
      }

      const results = await this.aiService.searchSimilarContacts(query, ownerId, limit);
      return {
        data: results,
        meta: {
          total: results.length,
          page: 1,
          limit,
          totalPages: 1,
          searchType: 'semantic',
        },
      };
    } catch (error) {
      this.logger.error('Erro na busca semântica, usando busca tradicional:', error);
      return this.findAll(ownerId, 1, limit, query);
    }
  }

  /**
   * Regenera embeddings para todos os contatos de um usuário
   */
  async regenerateAllEmbeddings(ownerId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        location: true,
        context: true,
        notes: true,
      },
    });

    this.logger.log(`Regenerando embeddings para ${contacts.length} contatos`);

    for (const contact of contacts) {
      await this.generateEmbeddingForContact(contact.id, {
        name: contact.name,
        location: contact.location || undefined,
        context: contact.context || undefined,
        notes: contact.notes || undefined,
      });
    }

    return { processed: contacts.length };
  }

  // ============================================
  // BUSCA EM 2 NÍVEIS
  // ============================================

  /**
   * Busca em 2 níveis: primeiro contatos diretos, depois conexões mencionadas (ponte)
   * Com suporte a variações de nomes (Matheus/Mateus, João/Joao)
   *
   * OTIMIZADO: Usa cache para queries repetidas (TTL 5 min)
   */
  async search(ownerId: string, query: string, skipAmbiguityCheck = false): Promise<SearchResult> {
    // Verificar se é termo ambíguo usando IA (pular se já foi clarificado)
    if (!skipAmbiguityCheck) {
      const ambiguity = await this.checkQueryAmbiguity(query);
      if (ambiguity && ambiguity.isAmbiguous) {
        this.logger.log(`Termo ambíguo detectado pela IA: "${query}" - solicitando clarificação`);
        return {
          type: 'ambiguous',
          data: [],
          message: `Sua busca pode ter diferentes interpretações. Qual você procura?`,
          query,
          disambiguation: {
            term: ambiguity.term,
            options: ambiguity.options,
          },
        };
      }
    }

    // Use cache for repeated searches (5 min TTL)
    return this.searchCache.getOrSearch(ownerId, query, () => this.searchUncached(ownerId, query));
  }

  /**
   * Internal search implementation (uncached)
   */
  private async searchUncached(ownerId: string, query: string): Promise<SearchResult> {
    this.logger.log(`Busca em 2 níveis: "${query}"`);

    // Extrair nome da query
    let searchName = query;
    const nameMatch = query.match(/(?:sobre\s+(?:o|a)?\s*|quem\s+[eé]\s*(?:o|a)?\s*)(.+)/i);
    if (nameMatch) {
      searchName = nameMatch[1].trim();
    }

    // 1. Busca por nome com normalização (encontra Matheus buscando por Mateus)
    const directByName = await this.searchByNameNormalized(ownerId, searchName);
    if (directByName) {
      return {
        type: 'direto',
        data: [directByName],
        message: this.formatDirectMessage(directByName),
        query: searchName,
      };
    }

    // 2. Busca semântica em Contacts (Nível 1)
    try {
      const isConfigured = await this.aiService.isConfigured();
      if (isConfigured) {
        const directResults = await this.semanticSearchContacts(ownerId, query);

        if (directResults.length > 0 && directResults[0].similarity > 0.7) {
          return {
            type: 'direto',
            data: directResults,
            message: this.formatDirectMessage(directResults[0]),
            query: searchName,
          };
        }
      }
    } catch (error) {
      this.logger.error('Erro na busca semântica:', error);
    }

    // 3. Busca por texto simples em Contacts
    const textResults = await this.searchByText(ownerId, query);
    if (textResults.length > 0) {
      return {
        type: 'direto',
        data: textResults,
        message: this.formatDirectMessage(textResults[0]),
        query: searchName,
      };
    }

    // 4. Busca em MentionedConnections (Nível 2 - Ponte)
    const bridgeResults = await this.searchMentionedConnections(ownerId, query);
    if (bridgeResults.length > 0) {
      return {
        type: 'ponte',
        data: bridgeResults,
        message: this.formatBridgeMessage(bridgeResults),
        query: searchName,
      };
    }

    // 5. Não encontrou - buscar nomes similares para sugestão
    const similarNames = await this.findSimilarNames(ownerId, searchName);
    const suggestions = similarNames.map((s) => s.name);

    return {
      type: 'nenhum',
      data: [],
      message: 'Nenhum contato encontrado para essa busca.',
      suggestions,
      query: searchName,
    };
  }

  // ============================================
  // DISAMBIGUAÇÃO COM IA
  // ============================================

  /**
   * Verifica se uma query é ambígua usando IA
   * Retorna opções de clarificação se necessário
   */
  async checkQueryAmbiguity(
    query: string,
  ): Promise<{
    isAmbiguous: boolean;
    term: string;
    options: Array<{ key: string; label: string; description: string }>;
  } | null> {
    try {
      const result = await this.aiService.detectQueryAmbiguity(query);

      if (result.isAmbiguous && result.options.length > 0) {
        return {
          isAmbiguous: true,
          term: query,
          options: result.options,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`Erro ao verificar ambiguidade: ${error.message}`);
      return null;
    }
  }

  /**
   * Busca com termo clarificado pelo usuário
   * Usa IA para ranquear contatos por relevância semântica
   */
  async searchWithClarification(
    ownerId: string,
    originalQuery: string,
    clarification: string, // contexto da opção selecionada
  ): Promise<SearchResult> {
    this.logger.log(`Busca com clarificação: "${originalQuery}" + "${clarification}"`);

    // Buscar todos os contatos com contexto do usuário
    const allContacts = await this.getAllContactsWithContext(ownerId);

    if (allContacts.length === 0) {
      return {
        type: 'nenhum',
        data: [],
        message: 'Você ainda não tem contatos cadastrados.',
        query: originalQuery,
      };
    }

    // Usar IA para ranquear por relevância
    const ranking = await this.aiService.rankContactsByRelevance(
      originalQuery,
      allContacts.map((c) => ({
        id: c.id,
        name: c.name,
        context: c.connectionContext || c.context || '',
      })),
      clarification,
    );

    // Filtrar contatos com score >= 50 (relevantes)
    const relevantIds = ranking.rankings
      .filter((r) => r.score >= 50)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.contactId);

    if (relevantIds.length === 0) {
      return {
        type: 'nenhum',
        data: [],
        message: ranking.suggestion || `Não encontrei contatos relevantes para "${originalQuery}" na área de ${clarification}.`,
        query: originalQuery,
      };
    }

    // Retornar contatos ordenados por relevância
    const relevantContacts = relevantIds
      .map((id) => allContacts.find((c) => c.id === id))
      .filter(Boolean);

    // Adicionar reason do ranking ao primeiro contato
    const bestRanking = ranking.rankings.find((r) => r.contactId === relevantIds[0]);

    return {
      type: 'direto',
      data: relevantContacts,
      message: this.formatRankedMessage(relevantContacts[0], originalQuery, bestRanking?.reason),
      query: originalQuery,
    };
  }

  /**
   * Busca todos os contatos com contexto (do contato e da conexão)
   */
  private async getAllContactsWithContext(ownerId: string): Promise<any[]> {
    const contacts = await this.prisma.$queryRaw<any[]>`
      SELECT
        c.id,
        c.name,
        c.phone,
        c.email,
        c.context,
        c.location,
        conn.context as "connectionContext"
      FROM contacts c
      LEFT JOIN connections conn ON conn."contactId" = c.id AND conn."fromUserId" = c."ownerId"
      WHERE c."ownerId" = ${ownerId}
      ORDER BY c."createdAt" DESC
      LIMIT 100
    `;
    return contacts;
  }

  /**
   * Formata mensagem para resultado ranqueado por IA
   */
  private formatRankedMessage(contact: any, query: string, reason?: string): string {
    const parts: string[] = [];

    parts.push(`🎯 *${contact.name}* pode te ajudar com *${query}*!`);

    if (reason) {
      parts.push(`\n\n💡 _${reason}_`);
    } else if (contact.connectionContext || contact.context) {
      parts.push(`\n\n📝 _${contact.connectionContext || contact.context}_`);
    }

    return parts.join('');
  }

  // ============================================
  // BUSCA POR SERVIÇO/PRODUTO
  // ============================================

  /**
   * Mapeamento de termos de serviço para keywords de empresa
   * Permite encontrar "Sea Offices" quando usuário pede "sala"
   */
  private readonly SERVICE_KEYWORDS: Record<string, string[]> = {
    sala: ['office', 'coworking', 'escritorio', 'comercial', 'sala'],
    'sala comercial': ['office', 'coworking', 'escritorio', 'comercial'],
    escritorio: ['office', 'coworking', 'comercial', 'escritorio'],
    escritório: ['office', 'coworking', 'comercial', 'escritorio'],
    coworking: ['office', 'coworking', 'workspace', 'hub'],
    espaco: ['office', 'coworking', 'espaco', 'space'],
    espaço: ['office', 'coworking', 'espaco', 'space'],
    moveis: ['moveis', 'marcenaria', 'planejados', 'mobilia', 'furniture'],
    móveis: ['moveis', 'marcenaria', 'planejados', 'mobilia', 'furniture'],
    'moveis planejados': ['moveis', 'marcenaria', 'planejados'],
    'móveis planejados': ['moveis', 'marcenaria', 'planejados'],
    computador: ['computador', 'informatica', 'tech', 'tecnologia', 'ti'],
    computadores: ['computador', 'informatica', 'tech', 'tecnologia', 'ti'],
    equipamentos: ['equipamentos', 'suprimentos', 'supplies'],
    impressora: ['impressora', 'impressao', 'grafica', 'print'],
    grafica: ['grafica', 'impressao', 'print', 'design'],
    gráfica: ['grafica', 'impressao', 'print', 'design'],
    advogado: ['advocacia', 'advogados', 'juridico', 'law', 'legal'],
    contador: ['contabilidade', 'contadores', 'contabil', 'accounting'],
    contabilidade: ['contabilidade', 'contadores', 'contabil', 'accounting'],
    marketing: ['marketing', 'publicidade', 'propaganda', 'midia', 'digital'],
    design: ['design', 'designer', 'criativo', 'creative'],
    tecnologia: ['tech', 'tecnologia', 'software', 'ti', 'desenvolvimento'],
    software: ['software', 'tech', 'desenvolvimento', 'sistemas'],
    fotografia: ['foto', 'fotografia', 'fotografo', 'photo', 'studio'],
    video: ['video', 'filmagem', 'producao', 'audiovisual'],
    consultoria: ['consultoria', 'consulting', 'assessoria'],
    treinamento: ['treinamento', 'capacitacao', 'curso', 'training'],
  };

  /**
   * Busca contatos que oferecem um serviço ou produto específico
   * Usa múltiplas estratégias: semântica, tags, texto livre em context
   */
  async searchByServiceOrProduct(
    ownerId: string,
    query: string,
    limit = 5,
  ): Promise<{ contacts: any[]; searchType: string }> {
    const normalizedQuery = this.normalizeString(query);
    this.logger.log(`Busca por serviço/produto: "${query}" (normalizado: "${normalizedQuery}")`);

    // 1. Busca semântica em context/notes (se IA configurada)
    try {
      const isConfigured = await this.aiService.isConfigured();
      if (isConfigured) {
        const semanticResults = await this.semanticSearchContacts(ownerId, query, limit);
        const filtered = semanticResults.filter((c) => c.similarity > 0.7);
        if (filtered.length > 0) {
          this.logger.log(`Busca semântica encontrou ${filtered.length} resultados`);
          return { contacts: filtered, searchType: 'semantic' };
        }
      }
    } catch (error) {
      this.logger.warn(`Erro na busca semântica: ${error.message}`);
    }

    // 2. Busca por tags relacionadas
    const tagResults = await this.searchByRelatedTags(ownerId, normalizedQuery, limit);
    if (tagResults.length > 0) {
      this.logger.log(`Busca por tags encontrou ${tagResults.length} resultados`);
      return { contacts: tagResults, searchType: 'tags' };
    }

    // 3. Fallback: busca texto livre em context/notes
    const textResults = await this.searchByTextForService(ownerId, query, limit);
    if (textResults.length > 0) {
      this.logger.log(`Busca por texto encontrou ${textResults.length} resultados`);
      return { contacts: textResults, searchType: 'text' };
    }

    this.logger.log(`Nenhum resultado encontrado para serviço: "${query}"`);
    return { contacts: [], searchType: 'none' };
  }

  /**
   * Obtém keywords relacionadas a um termo de serviço
   */
  private getRelatedKeywords(normalizedQuery: string): string[] {
    // Busca correspondência direta no mapeamento
    if (this.SERVICE_KEYWORDS[normalizedQuery]) {
      return this.SERVICE_KEYWORDS[normalizedQuery];
    }

    // Busca correspondência parcial (termo contém ou está contido)
    for (const [term, keywords] of Object.entries(this.SERVICE_KEYWORDS)) {
      const normalizedTerm = this.normalizeString(term);
      if (normalizedQuery.includes(normalizedTerm) || normalizedTerm.includes(normalizedQuery)) {
        return keywords;
      }
    }

    // Se não encontrou mapeamento, usa o próprio termo como keyword
    return [normalizedQuery];
  }

  /**
   * Busca contatos por tags relacionadas ao serviço/produto
   */
  private async searchByRelatedTags(
    ownerId: string,
    normalizedQuery: string,
    limit: number,
  ): Promise<any[]> {
    const keywords = this.getRelatedKeywords(normalizedQuery);

    // Busca tags que contêm alguma das keywords
    const tags = await this.prisma.tag.findMany({
      where: {
        createdById: ownerId,
        OR: keywords.map((keyword) => ({
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { slug: { contains: keyword, mode: 'insensitive' } },
          ],
        })),
      },
      select: { id: true },
    });

    if (tags.length === 0) {
      return [];
    }

    // Busca contatos com essas tags
    const contacts = await this.prisma.contact.findMany({
      where: {
        ownerId,
        tags: {
          some: {
            tagId: { in: tags.map((t) => t.id) },
          },
        },
      },
      include: {
        tags: { include: { tag: true } },
      },
      take: limit,
    });

    return contacts.map(this.formatContactResponse);
  }

  /**
   * Busca texto livre em context/notes para serviço/produto
   */
  private async searchByTextForService(
    ownerId: string,
    query: string,
    limit: number,
  ): Promise<any[]> {
    const keywords = this.getRelatedKeywords(this.normalizeString(query));

    const contacts = await this.prisma.contact.findMany({
      where: {
        ownerId,
        OR: keywords.flatMap((keyword) => [
          { context: { contains: keyword, mode: 'insensitive' } },
          { notes: { contains: keyword, mode: 'insensitive' } },
          { name: { contains: keyword, mode: 'insensitive' } },
        ]),
      },
      include: {
        tags: { include: { tag: true } },
      },
      take: limit,
    });

    return contacts.map(this.formatContactResponse);
  }

  /**
   * Busca contato por nome com normalização (encontra variações)
   * Mateus encontra Matheus, Joao encontra João, etc.
   * PUBLIC: usado pelo WhatsappService para update_contact
   *
   * OTIMIZADO: Usa pg_trgm para fuzzy search no banco ao invés de carregar todos os contatos
   */
  async searchByNameNormalized(ownerId: string, searchName: string) {
    const normalizedSearch = this.normalizeString(searchName);
    this.logger.log(`Busca normalizada: "${searchName}" → "${normalizedSearch}"`);

    // 1. Primeiro tenta match exato case-insensitive (mais rápido)
    const exactMatch = await this.prisma.contact.findFirst({
      where: {
        ownerId,
        name: { equals: searchName, mode: 'insensitive' },
      },
      include: { tags: { include: { tag: true } } },
    });

    if (exactMatch) {
      this.logger.log(`Match exato: ${exactMatch.name}`);
      return exactMatch;
    }

    // 2. Busca por similaridade usando pg_trgm (threshold 0.3 para fuzzy match)
    // Retorna o contato com maior similaridade acima do threshold
    const fuzzyResults = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        phone: string | null;
        email: string | null;
        location: string | null;
        notes: string | null;
        context: string | null;
        ownerId: string;
        createdAt: Date;
        updatedAt: Date;
        similarity: number;
      }>
    >`
      SELECT
        id, name, phone, email, location, notes, context,
        "ownerId", "createdAt", "updatedAt",
        similarity(name, ${searchName}) as similarity
      FROM contacts
      WHERE "ownerId" = ${ownerId}
        AND (
          similarity(name, ${searchName}) > 0.3
          OR name ILIKE ${'%' + searchName + '%'}
          OR ${searchName} ILIKE '%' || name || '%'
        )
      ORDER BY similarity(name, ${searchName}) DESC
      LIMIT 1
    `;

    if (fuzzyResults.length > 0) {
      const result = fuzzyResults[0];
      this.logger.log(
        `Match por similaridade (${(result.similarity * 100).toFixed(0)}%): ${result.name}`,
      );

      // Busca o contato completo com tags via Prisma para manter formato consistente
      const contact = await this.prisma.contact.findUnique({
        where: { id: result.id },
        include: { tags: { include: { tag: true } } },
      });

      return contact;
    }

    this.logger.log(`Nenhum match encontrado para: ${searchName}`);
    return null;
  }

  /**
   * Busca contato por nome (case-insensitive) - método legado
   */
  private async searchByName(ownerId: string, name: string) {
    return this.prisma.contact.findFirst({
      where: {
        ownerId,
        name: { contains: name, mode: 'insensitive' },
      },
      include: {
        tags: { include: { tag: true } },
      },
    });
  }

  /**
   * Busca semântica usando embeddings
   */
  private async semanticSearchContacts(
    ownerId: string,
    query: string,
    limit = 5,
  ): Promise<ContactWithSimilarity[]> {
    const embedding = await this.aiService.generateEmbedding(query);

    const results = await this.prisma.$queryRaw<ContactWithSimilarity[]>`
      SELECT
        id, name, location, context, phone, email,
        1 - (embedding <=> ${embedding}::vector) as similarity
      FROM contacts
      WHERE "ownerId" = ${ownerId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embedding}::vector
      LIMIT ${limit}
    `;

    return results;
  }

  /**
   * Busca por texto em múltiplos campos
   */
  private async searchByText(ownerId: string, query: string, limit = 5) {
    return this.prisma.contact.findMany({
      where: {
        ownerId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { context: { contains: query, mode: 'insensitive' } },
          { notes: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        tags: { include: { tag: true } },
      },
      take: limit,
    });
  }

  /**
   * Busca em conexões mencionadas
   */
  private async searchMentionedConnections(
    ownerId: string,
    query: string,
  ): Promise<MentionedConnectionWithContact[]> {
    return this.prisma.mentionedConnection.findMany({
      where: {
        contact: { ownerId },
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { hasSome: [query.toLowerCase()] } },
        ],
      },
      include: {
        contact: {
          select: { id: true, name: true },
        },
      },
      take: 10,
    });
  }

  /**
   * Formata mensagem para resultado direto - mais conversacional
   */
  private formatDirectMessage(contact: any): string {
    const parts: string[] = [];

    // Variação de abertura para ser mais natural
    const openers = ['Achei!', 'Encontrei!', 'Sim!', 'Tenho aqui:'];
    const opener = openers[Math.floor(Math.random() * openers.length)];

    parts.push(`${opener} *${contact.name}*`);

    if (contact.location) {
      parts.push(`📍 ${contact.location}`);
    }

    if (contact.context) {
      parts.push(`\n\n📝 _${contact.context}_`);
    }

    if (contact.phone) {
      parts.push(`\n\n📱 ${contact.phone}`);
    }

    if (contact.email) {
      parts.push(`📧 ${contact.email}`);
    }

    return parts.join(' ');
  }

  /**
   * Formata mensagem para resultado ponte - mais conversacional
   */
  private formatBridgeMessage(connections: MentionedConnectionWithContact[]): string {
    if (connections.length === 1) {
      const conn = connections[0];
      const desc = conn.description || 'conhece essa pessoa';
      return `Não tenho *${conn.name}* na sua rede diretamente, mas *${conn.contact.name}* mencionou:\n\n_"${desc}"_\n\nQuer que eu busque mais informações?`;
    }

    const lines = connections.map(
      (conn) => `• *${conn.name}* - mencionado por *${conn.contact.name}*`,
    );
    return `Encontrei ${connections.length} pessoas com esse nome mencionadas na sua rede:\n\n${lines.join('\n')}\n\nQual delas você quer saber mais?`;
  }

  // ============================================
  // UPSERT COM CONEXÕES MENCIONADAS
  // ============================================

  /**
   * Cria ou atualiza contato a partir de extração
   */
  async upsertFromExtraction(ownerId: string, extraction: ExtractionResult) {
    if (!extraction.success || !extraction.data.name) {
      throw new Error('Dados de extração inválidos');
    }

    const extractedContact = extraction.data;

    // Buscar contato existente por nome ou telefone
    let contact = await this.findExistingContact(ownerId, extractedContact);

    if (contact) {
      // Merge: atualizar campos não-nulos
      contact = await this.prisma.contact.update({
        where: { id: contact.id },
        data: this.mergeContactData(contact, extractedContact),
        include: { tags: { include: { tag: true } } },
      });
      this.logger.log(`Contato atualizado: ${contact.name} (${contact.id})`);
    } else {
      // Criar novo contato
      contact = await this.prisma.contact.create({
        data: {
          ownerId,
          name: extractedContact.name!,
          phone: extractedContact.phone || null,
          email: extractedContact.email || null,
          location: extractedContact.location || null,
          context: extractedContact.context || null,
        },
        include: { tags: { include: { tag: true } } },
      });
      this.logger.log(`Contato criado: ${contact.name} (${contact.id})`);
    }

    // Criar e associar tags extraídas
    if (extractedContact.tags && extractedContact.tags.length > 0) {
      await this.createAndAssignTags(ownerId, contact.id, extractedContact.tags);
      // Recarregar contato com tags atualizadas
      contact = (await this.prisma.contact.findUnique({
        where: { id: contact.id },
        include: { tags: { include: { tag: true } } },
      })) as typeof contact;
    }

    // Gerar embedding assíncrono
    this.generateEmbeddingForContact(contact.id, {
      name: contact.name,
      location: contact.location || undefined,
      context: contact.context || undefined,
    });

    return this.formatContactResponse(contact);
  }

  /**
   * Busca contato existente por nome ou telefone
   */
  private async findExistingContact(ownerId: string, data: { name?: string; phone?: string }) {
    if (data.phone) {
      const byPhone = await this.prisma.contact.findFirst({
        where: { ownerId, phone: data.phone },
      });
      if (byPhone) return byPhone;
    }

    if (data.name) {
      const byName = await this.prisma.contact.findFirst({
        where: {
          ownerId,
          name: { equals: data.name, mode: 'insensitive' },
        },
      });
      if (byName) return byName;
    }

    return null;
  }

  /**
   * Mescla dados do contato existente com novos dados (só atualiza campos não-nulos)
   */
  private mergeContactData(existing: any, newData: any) {
    return {
      name: newData.name || existing.name,
      phone: newData.phone || existing.phone,
      email: newData.email || existing.email,
      location: newData.location || existing.location,
      context: newData.context
        ? existing.context
          ? `${existing.context}\n\n${newData.context}`
          : newData.context
        : existing.context,
    };
  }

  /**
   * Cria tags (se não existirem) e associa ao contato
   */
  private async createAndAssignTags(
    userId: string,
    contactId: string,
    tagNames: string[],
  ): Promise<void> {
    for (const tagName of tagNames) {
      if (!tagName || tagName.trim().length === 0) continue;

      const slug = tagName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      if (!slug) continue;

      // Busca ou cria a tag
      let tag = await this.prisma.tag.findFirst({
        where: { slug, createdById: userId },
      });

      if (!tag) {
        tag = await this.prisma.tag.create({
          data: {
            name: tagName.trim(),
            slug,
            type: 'FREE',
            createdById: userId,
          },
        });
        this.logger.log(`Tag criada: ${tag.name} (${tag.id})`);
      }

      // Associa ao contato (ignora se já existir)
      await this.prisma.contactTag.upsert({
        where: {
          contactId_tagId: { contactId, tagId: tag.id },
        },
        create: { contactId, tagId: tag.id },
        update: {},
      });
    }

    this.logger.log(`${tagNames.length} tags processadas para contato ${contactId}`);
  }

  /**
   * Extrai tags do contexto usando IA e associa ao contato
   */
  private async extractAndAssignTags(
    userId: string,
    contactId: string,
    data: Partial<CreateContactDto>,
  ): Promise<void> {
    try {
      const isConfigured = await this.aiService.isConfigured();
      if (!isConfigured) {
        this.logger.warn('IA não configurada, pulando extração de tags');
        return;
      }

      const extractedTags = await this.aiService.extractTagsFromContext({
        context: data.context,
        name: data.name,
      });

      if (extractedTags.length > 0) {
        await this.createAndAssignTags(userId, contactId, extractedTags);
        this.logger.log(
          `Tags extraídas e atribuídas ao contato ${contactId}: ${extractedTags.join(', ')}`,
        );
      }
    } catch (error) {
      this.logger.error(`Erro ao extrair/atribuir tags: ${error.message}`);
    }
  }

  private formatContactResponse(contact: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    location: string | null;
    notes: string | null;
    context: string | null;
    createdAt: Date;
    updatedAt: Date;
    tags?: { tag: { id: string; name: string; color: string | null; type: string } }[];
  }) {
    return {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      location: contact.location,
      notes: contact.notes,
      context: contact.context,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      tags: contact.tags?.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        color: ct.tag.color,
        type: ct.tag.type,
      })),
    };
  }
}
