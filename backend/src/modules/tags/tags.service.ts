import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { TagType } from '@prisma/client';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTagDto) {
    const slug = this.generateSlug(dto.name);

    // Verifica se já existe uma tag com esse slug no mesmo escopo
    const existing = await this.prisma.tag.findFirst({
      where: {
        slug,
        groupId: dto.groupId || null,
      },
    });

    if (existing) {
      throw new ConflictException('Já existe uma tag com esse nome');
    }

    // Se for tag institucional, verifica se o usuário pertence ao grupo
    if (dto.type === TagType.INSTITUTIONAL && dto.groupId) {
      const membership = await this.prisma.groupMember.findUnique({
        where: {
          userId_groupId: {
            userId,
            groupId: dto.groupId,
          },
        },
      });

      if (!membership || membership.leftAt) {
        throw new ForbiddenException('Você não pertence a este grupo');
      }
    }

    return this.prisma.tag.create({
      data: {
        name: dto.name,
        slug,
        type: dto.type || TagType.FREE,
        color: dto.color,
        groupId: dto.groupId,
        createdById: userId,
      },
    });
  }

  async findAll(userId: string, type?: TagType) {
    // Busca as tags livres do usuário e as tags institucionais dos grupos que ele pertence
    const userGroups = await this.prisma.groupMember.findMany({
      where: {
        userId,
        leftAt: null,
      },
      select: { groupId: true },
    });

    const groupIds = userGroups.map((g) => g.groupId);

    return this.prisma.tag.findMany({
      where: {
        AND: [
          type ? { type } : {},
          {
            OR: [
              // Tags livres criadas pelo usuário
              { type: TagType.FREE, createdById: userId },
              // Tags institucionais dos grupos do usuário
              { type: TagType.INSTITUTIONAL, groupId: { in: groupIds } },
            ],
          },
        ],
      },
      include: {
        group: {
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
        group: true,
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

    // Para tags institucionais, precisa ser admin do grupo
    if (tag.type === TagType.INSTITUTIONAL && tag.groupId) {
      const membership = await this.prisma.groupMember.findUnique({
        where: {
          userId_groupId: {
            userId,
            groupId: tag.groupId,
          },
        },
      });

      if (!membership || !membership.isAdmin || membership.leftAt) {
        throw new ForbiddenException('Apenas admins do grupo podem editar tags institucionais');
      }
    }

    const data: { name?: string; slug?: string; color?: string } = {};

    if (dto.name) {
      data.name = dto.name;
      data.slug = this.generateSlug(dto.name);
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

    if (tag.type === TagType.INSTITUTIONAL && tag.groupId) {
      const membership = await this.prisma.groupMember.findUnique({
        where: {
          userId_groupId: {
            userId,
            groupId: tag.groupId,
          },
        },
      });

      if (!membership || !membership.isAdmin || membership.leftAt) {
        throw new ForbiddenException('Apenas admins do grupo podem excluir tags institucionais');
      }
    }

    await this.prisma.tag.delete({
      where: { id },
    });
  }

  async revokeInstitutionalTags(userId: string, groupId: string) {
    // Remove todas as associações de tags institucionais do grupo dos contatos do usuário
    const groupTags = await this.prisma.tag.findMany({
      where: {
        type: TagType.INSTITUTIONAL,
        groupId,
      },
    });

    const tagIds = groupTags.map((t) => t.id);

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

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
