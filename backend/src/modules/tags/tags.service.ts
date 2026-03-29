import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { SlugUtil } from '@/common/utils/slug.util';

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTagDto) {
    const slug = SlugUtil.generate(dto.name);

    // Verifica se já existe uma tag com esse slug
    const existing = await this.prisma.tag.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException('Já existe uma tag com esse nome');
    }

    return this.prisma.tag.create({
      data: {
        name: dto.name,
        slug,
        color: dto.color,
        createdById: userId,
      },
    });
  }

  async findAll(userId: string) {
    // Busca as tags criadas pelo usuário
    return this.prisma.tag.findMany({
      where: {
        createdById: userId,
      },
      include: {
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
    });

    if (!tag) {
      throw new NotFoundException('Tag não encontrada');
    }

    return tag;
  }

  async update(id: string, userId: string, dto: UpdateTagDto) {
    const tag = await this.findById(id);

    // Apenas o criador pode atualizar a tag
    if (tag.createdById !== userId) {
      throw new ForbiddenException('Sem permissão para editar esta tag');
    }

    const data: { name?: string; slug?: string; color?: string } = {};

    if (dto.name) {
      data.name = dto.name;
      data.slug = SlugUtil.generate(dto.name);

      // Verifica se o novo slug já existe
      const existing = await this.prisma.tag.findFirst({
        where: {
          slug: data.slug,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException('Já existe uma tag com esse nome');
      }
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

    // Apenas o criador pode excluir a tag
    if (tag.createdById !== userId) {
      throw new ForbiddenException('Sem permissão para excluir esta tag');
    }

    await this.prisma.tag.delete({
      where: { id },
    });
  }
}
