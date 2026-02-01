import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { AIService } from '../ai/ai.service';

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
