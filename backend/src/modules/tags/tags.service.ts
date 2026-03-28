import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { TagType } from '@prisma/client';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { SlugUtil } from '@/common/utils/slug.util';

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTagDto) {
    const slug = SlugUtil.generate(dto.name);

    // Verifica se já existe uma tag com esse slug no mesmo escopo
    const existing = await this.prisma.tag.findFirst({
      where: {
        slug,
        clubId: dto.clubId || null,
      },
    });

    if (existing) {
      throw new ConflictException('Já existe uma tag com esse nome');
    }

    // Se for tag institucional, verifica se o usuário pertence ao clube
    if (dto.type === TagType.INSTITUTIONAL && dto.clubId) {
      const membership = await this.prisma.clubMember.findUnique({
        where: {
          userId_clubId: {
            userId,
            clubId: dto.clubId,
          },
        },
      });

      if (!membership || membership.leftAt) {
        throw new ForbiddenException('Você não pertence a este clube');
      }
    }

    return this.prisma.tag.create({
      data: {
        name: dto.name,
        slug,
        type: dto.type || TagType.FREE,
        color: dto.color,
        clubId: dto.clubId,
        createdById: userId,
      },
    });
  }

  async findAll(userId: string, type?: TagType) {
    // Busca as tags livres do usuário e as tags institucionais dos clubes que ele pertence
    const userClubs = await this.prisma.clubMember.findMany({
      where: {
        userId,
        leftAt: null,
      },
      select: { clubId: true },
    });

    const clubIds = userClubs.map((c) => c.clubId);

    return this.prisma.tag.findMany({
      where: {
        AND: [
          type ? { type } : {},
          {
            OR: [
              // Tags livres criadas pelo usuário
              { type: TagType.FREE, createdById: userId },
              // Tags institucionais dos clubes do usuário
              { type: TagType.INSTITUTIONAL, clubId: { in: clubIds } },
            ],
          },
        ],
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: { contacts: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: {
        club: true,
      },
    });

    if (!tag) {
      throw new NotFoundException('Tag não encontrada');
    }

    return tag;
  }

  async update(id: string, userId: string, dto: UpdateTagDto) {
    const tag = await this.findById(id);

    // Apenas o criador pode atualizar tags livres
    if (tag.type === TagType.FREE && tag.createdById !== userId) {
      throw new ForbiddenException('Sem permissão para editar esta tag');
    }

    // Para tags institucionais, precisa ser admin do clube
    if (tag.type === TagType.INSTITUTIONAL && tag.clubId) {
      const membership = await this.prisma.clubMember.findUnique({
        where: {
          userId_clubId: {
            userId,
            clubId: tag.clubId,
          },
        },
      });

      if (!membership || !membership.isAdmin || membership.leftAt) {
        throw new ForbiddenException('Apenas admins do clube podem editar tags institucionais');
      }
    }

    const data: { name?: string; slug?: string; color?: string } = {};

    if (dto.name) {
      data.name = dto.name;
      data.slug = SlugUtil.generate(dto.name);
    }

    if (dto.color) {
      data.color = dto.color;
    }

    return this.prisma.tag.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, userId: string) {
    const tag = await this.findById(id);

    // Verifica permissões
    if (tag.type === TagType.FREE && tag.createdById !== userId) {
      throw new ForbiddenException('Sem permissão para excluir esta tag');
    }

    if (tag.type === TagType.INSTITUTIONAL && tag.clubId) {
      const membership = await this.prisma.clubMember.findUnique({
        where: {
          userId_clubId: {
            userId,
            clubId: tag.clubId,
          },
        },
      });

      if (!membership || !membership.isAdmin || membership.leftAt) {
        throw new ForbiddenException('Apenas admins do clube podem excluir tags institucionais');
      }
    }

    await this.prisma.tag.delete({
      where: { id },
    });
  }

  async revokeInstitutionalTags(userId: string, clubId: string) {
    // Remove todas as associações de tags institucionais do clube dos contatos do usuário
    const clubTags = await this.prisma.tag.findMany({
      where: {
        type: TagType.INSTITUTIONAL,
        clubId,
      },
    });

    const tagIds = clubTags.map((t) => t.id);

    const userContacts = await this.prisma.contact.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    const contactIds = userContacts.map((c) => c.id);

    await this.prisma.contactTag.deleteMany({
      where: {
        contactId: { in: contactIds },
        tagId: { in: tagIds },
      },
    });
  }

  /**
   * Aplica uma tag em todos os contatos de um usuário
   * Usado quando um membro entra em um grupo patrocinado
   */
  async applyTagToAllUserContacts(userId: string, tagId: string): Promise<number> {
    const userContacts = await this.prisma.contact.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (userContacts.length === 0) {
      this.logger.log(`Nenhum contato encontrado para usuário ${userId}`);
      return 0;
    }

    const contactIds = userContacts.map((c) => c.id);

    // Usa createMany com skipDuplicates para evitar erros em tags já existentes
    const result = await this.prisma.contactTag.createMany({
      data: contactIds.map((contactId) => ({
        contactId,
        tagId,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Tag ${tagId} aplicada em ${result.count} contatos do usuário ${userId}`);

    return result.count;
  }

  /**
   * Remove uma tag de todos os contatos de um usuário
   * Usado quando um membro sai de um grupo patrocinado
   * Retorna a quantidade de contatos afetados
   */
  async removeTagFromAllUserContacts(userId: string, tagId: string): Promise<number> {
    const userContacts = await this.prisma.contact.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (userContacts.length === 0) {
      this.logger.log(`Nenhum contato encontrado para usuário ${userId}`);
      return 0;
    }

    const contactIds = userContacts.map((c) => c.id);

    const result = await this.prisma.contactTag.deleteMany({
      where: {
        contactId: { in: contactIds },
        tagId,
      },
    });

    this.logger.log(`Tag ${tagId} removida de ${result.count} contatos do usuário ${userId}`);

    return result.count;
  }
}
