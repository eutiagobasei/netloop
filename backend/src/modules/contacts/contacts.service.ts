import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { AIService } from '../ai/ai.service';
import {
  ExtractionWithConnectionsResult,
  MentionedConnectionData,
} from '../ai/dto/extracted-contact.dto';

// Tipos para resposta de busca
export interface SearchResult {
  type: 'direto' | 'ponte' | 'nenhum';
  data: any[];
  message: string;
}

interface ContactWithSimilarity {
  id: string;
  name: string;
  company: string | null;
  position: string | null;
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
  ) {}

  async create(ownerId: string, dto: CreateContactDto) {
    const { tagIds, ...contactData } = dto;

    const contact = await this.prisma.contact.create({
      data: {
        ...contactData,
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

    return this.formatContactResponse(contact);
  }

  /**
   * Gera embedding para um contato de forma assíncrona
   */
  private async generateEmbeddingForContact(contactId: string, contactData: Partial<CreateContactDto>) {
    try {
      const isConfigured = await this.aiService.isConfigured();
      if (!isConfigured) {
        this.logger.warn('IA não configurada, pulando geração de embedding');
        return;
      }

      // Concatena informações relevantes para o embedding
      const textParts = [
        contactData.name,
        contactData.company,
        contactData.position,
        contactData.location,
        contactData.context,
        contactData.notes,
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
          { company: { contains: search, mode: 'insensitive' as const } },
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
    const relevantFields = ['name', 'company', 'position', 'location', 'context', 'notes'];
    const hasRelevantChange = relevantFields.some(field => dto[field as keyof UpdateContactDto] !== undefined);

    if (hasRelevantChange) {
      this.generateEmbeddingForContact(id, {
        name: contact.name,
        company: contact.company || undefined,
        position: contact.position || undefined,
        location: contact.location || undefined,
        context: contact.context || undefined,
        notes: contact.notes || undefined,
      });
    }

    return this.formatContactResponse(contact);
  }

  async delete(id: string, ownerId: string) {
    await this.findById(id, ownerId);

    await this.prisma.contact.delete({
      where: { id },
    });
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
        company: true,
        position: true,
        location: true,
        context: true,
        notes: true,
      },
    });

    this.logger.log(`Regenerando embeddings para ${contacts.length} contatos`);

    for (const contact of contacts) {
      await this.generateEmbeddingForContact(contact.id, {
        name: contact.name,
        company: contact.company || undefined,
        position: contact.position || undefined,
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
   */
  async search(ownerId: string, query: string): Promise<SearchResult> {
    this.logger.log(`Busca em 2 níveis: "${query}"`);

    // 1. Verificar se é busca direta por nome (ex: "sobre o João", "quem é Maria")
    const nameMatch = query.match(/(?:sobre\s+(?:o|a)?\s*|quem\s+[eé]\s*)(.+)/i);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      const direct = await this.searchByName(ownerId, name);
      if (direct) {
        return {
          type: 'direto',
          data: [direct],
          message: this.formatDirectMessage(direct),
        };
      }
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
      };
    }

    // 4. Busca em MentionedConnections (Nível 2 - Ponte)
    const bridgeResults = await this.searchMentionedConnections(ownerId, query);
    if (bridgeResults.length > 0) {
      return {
        type: 'ponte',
        data: bridgeResults,
        message: this.formatBridgeMessage(bridgeResults),
      };
    }

    return {
      type: 'nenhum',
      data: [],
      message: 'Nenhum contato encontrado para essa busca.',
    };
  }

  /**
   * Busca contato por nome (case-insensitive)
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
        id, name, company, position, location, context, phone, email,
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
          { company: { contains: query, mode: 'insensitive' } },
          { position: { contains: query, mode: 'insensitive' } },
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
   * Formata mensagem para resultado direto
   */
  private formatDirectMessage(contact: any): string {
    const parts = [`Encontrei *${contact.name}*`];

    if (contact.position && contact.company) {
      parts.push(`- ${contact.position} na ${contact.company}`);
    } else if (contact.position) {
      parts.push(`- ${contact.position}`);
    } else if (contact.company) {
      parts.push(`- ${contact.company}`);
    }

    if (contact.context) {
      parts.push(`\n📝 ${contact.context}`);
    }

    return parts.join(' ');
  }

  /**
   * Formata mensagem para resultado ponte
   */
  private formatBridgeMessage(connections: MentionedConnectionWithContact[]): string {
    if (connections.length === 1) {
      const conn = connections[0];
      return `Não tenho *${conn.name}* como contato direto, mas *${conn.contact.name}* mencionou: "${conn.description || 'conhece essa pessoa'}"`;
    }

    const lines = connections.map(
      (conn) => `• *${conn.name}* (mencionado por ${conn.contact.name})`,
    );
    return `Encontrei ${connections.length} menções:\n${lines.join('\n')}`;
  }

  // ============================================
  // UPSERT COM CONEXÕES MENCIONADAS
  // ============================================

  /**
   * Cria ou atualiza contato a partir de extração + salva conexões mencionadas
   */
  async upsertFromExtraction(
    ownerId: string,
    extraction: ExtractionWithConnectionsResult,
  ) {
    if (!extraction.success || !extraction.contact.name) {
      throw new Error('Dados de extração inválidos');
    }

    const { contact: extractedContact, connections } = extraction;

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
          company: extractedContact.company || null,
          position: extractedContact.position || null,
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
      contact = await this.prisma.contact.findUnique({
        where: { id: contact.id },
        include: { tags: { include: { tag: true } } },
      }) as typeof contact;
    }

    // Salvar conexões mencionadas
    if (connections && connections.length > 0) {
      await this.saveMentionedConnections(contact.id, connections);
    }

    // Gerar embedding assíncrono
    this.generateEmbeddingForContact(contact.id, {
      name: contact.name,
      company: contact.company || undefined,
      position: contact.position || undefined,
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
      company: newData.company || existing.company,
      position: newData.position || existing.position,
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
   * Salva conexões mencionadas (upsert por nome)
   */
  private async saveMentionedConnections(
    contactId: string,
    connections: MentionedConnectionData[],
  ) {
    for (const conn of connections) {
      // Verifica se já existe essa menção
      const existing = await this.prisma.mentionedConnection.findFirst({
        where: {
          contactId,
          name: { equals: conn.name, mode: 'insensitive' },
        },
      });

      if (existing) {
        // Atualiza descrição se houver nova
        await this.prisma.mentionedConnection.update({
          where: { id: existing.id },
          data: {
            description: conn.about || existing.description,
            tags: conn.tags?.length ? conn.tags : existing.tags,
            phone: conn.phone || existing.phone,
          },
        });
      } else {
        // Cria nova menção
        await this.prisma.mentionedConnection.create({
          data: {
            contactId,
            name: conn.name,
            description: conn.about || null,
            tags: conn.tags || [],
            phone: conn.phone || null,
          },
        });
      }
    }

    this.logger.log(`${connections.length} conexões mencionadas salvas para contato ${contactId}`);
  }

  private formatContactResponse(contact: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    company: string | null;
    position: string | null;
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
      company: contact.company,
      position: contact.position,
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
