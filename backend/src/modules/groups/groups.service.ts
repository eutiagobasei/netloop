import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { TagType } from '@prisma/client';
import { CreateGroupDto, UpdateGroupDto, AddMemberDto } from './dto';
import { TagsService } from '../tags/tags.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SlugUtil } from '@/common/utils/slug.util';

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tagsService: TagsService,
    private readonly whatsappService: WhatsappService,
  ) {}

  /**
   * Cria um novo grupo com sua tag institucional
   */
  async create(adminUserId: string, dto: CreateGroupDto) {
    const slug = SlugUtil.generate(dto.name);

    const existing = await this.prisma.group.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
    });

    if (existing) {
      throw new ConflictException('Já existe um grupo com esse nome');
    }

    // Cria o grupo e adiciona o criador como admin
    const group = await this.prisma.$transaction(async (tx) => {
      const newGroup = await tx.group.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          color: dto.color,
          isVerified: dto.isVerified ?? false,
        },
      });

      // Adiciona o criador como admin
      await tx.groupMember.create({
        data: {
          userId: adminUserId,
          groupId: newGroup.id,
          isAdmin: true,
        },
      });

      // Cria a tag institucional do grupo
      await tx.tag.create({
        data: {
          name: dto.name,
          slug,
          type: TagType.INSTITUTIONAL,
          color: dto.color || '#6366f1',
          isVerified: dto.isVerified ?? false,
          groupId: newGroup.id,
          createdById: adminUserId,
        },
      });

      return newGroup;
    });

    this.logger.log(`Grupo criado: ${group.name} (ID: ${group.id}) por usuário ${adminUserId}`);

    return this.findById(group.id);
  }

  /**
   * Lista todos os grupos ativos
   */
  async findAll(includeInactive = false) {
    return this.prisma.group.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: {
          select: { members: { where: { leftAt: null } } },
        },
        tags: {
          where: { type: TagType.INSTITUTIONAL },
          select: { id: true, name: true, color: true, isVerified: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Busca um grupo pelo ID
   * Requer que o usuário seja membro do grupo para ver detalhes completos
   */
  async findById(id: string, userId?: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        tags: {
          where: { type: TagType.INSTITUTIONAL },
          select: { id: true, name: true, color: true, isVerified: true },
        },
        _count: {
          select: { members: { where: { leftAt: null } } },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    // Se userId foi fornecido, verifica se é membro do grupo
    if (userId) {
      const isMember = group.members.some((m) => m.user.id === userId);
      if (!isMember) {
        // Retorna versão limitada sem dados sensíveis
        return {
          id: group.id,
          name: group.name,
          slug: group.slug,
          description: group.description,
          isVerified: group.isVerified,
          color: group.color,
          isActive: group.isActive,
          tags: group.tags,
          _count: group._count,
          members: [], // Não expõe membros para não-membros
        };
      }
    }

    return group;
  }

  /**
   * Atualiza um grupo
   */
  async update(id: string, userId: string, dto: UpdateGroupDto) {
    await this.ensureAdmin(id, userId);

    const group = await this.findById(id);

    const data: Partial<UpdateGroupDto> & { slug?: string } = { ...dto };

    // Se mudar o nome, atualiza também o slug e a tag
    if (dto.name && dto.name !== group.name) {
      data.slug = SlugUtil.generate(dto.name);

      // Atualiza a tag institucional
      await this.prisma.tag.updateMany({
        where: { groupId: id, type: TagType.INSTITUTIONAL },
        data: {
          name: dto.name,
          slug: data.slug,
          ...(dto.color && { color: dto.color }),
          ...(dto.isVerified !== undefined && { isVerified: dto.isVerified }),
        },
      });
    } else if (dto.color || dto.isVerified !== undefined) {
      // Atualiza apenas cor/verificado da tag
      await this.prisma.tag.updateMany({
        where: { groupId: id, type: TagType.INSTITUTIONAL },
        data: {
          ...(dto.color && { color: dto.color }),
          ...(dto.isVerified !== undefined && { isVerified: dto.isVerified }),
        },
      });
    }

    await this.prisma.group.update({
      where: { id },
      data,
    });

    return this.findById(id);
  }

  /**
   * Adiciona um membro ao grupo e aplica a tag institucional em todos os contatos dele
   */
  async addMember(groupId: string, adminUserId: string, dto: AddMemberDto) {
    await this.ensureAdmin(groupId, adminUserId);

    const group = await this.findById(groupId);

    // Verifica se o usuário existe
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, name: true, phone: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verifica se já é membro
    const existingMembership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: dto.userId, groupId } },
    });

    if (existingMembership && !existingMembership.leftAt) {
      throw new ConflictException('Usuário já é membro deste grupo');
    }

    // Se tinha saído antes, reativa a membership
    if (existingMembership) {
      await this.prisma.groupMember.update({
        where: { id: existingMembership.id },
        data: {
          leftAt: null,
          isAdmin: dto.isAdmin ?? false,
          joinedAt: new Date(),
        },
      });
    } else {
      await this.prisma.groupMember.create({
        data: {
          userId: dto.userId,
          groupId,
          isAdmin: dto.isAdmin ?? false,
        },
      });
    }

    // Busca a tag institucional do grupo
    const groupTag = await this.prisma.tag.findFirst({
      where: { groupId, type: TagType.INSTITUTIONAL },
    });

    if (groupTag) {
      // Aplica a tag em todos os contatos do novo membro
      await this.tagsService.applyTagToAllUserContacts(dto.userId, groupTag.id);
    }

    this.logger.log(`Membro ${user.name} adicionado ao grupo ${group.name}`);

    return { message: `${user.name} adicionado ao grupo ${group.name}` };
  }

  /**
   * Remove um membro do grupo, remove a tag dos contatos e envia notificação de escassez
   */
  async removeMember(groupId: string, adminUserId: string, userId: string) {
    await this.ensureAdmin(groupId, adminUserId);

    const group = await this.findById(groupId);

    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!membership || membership.leftAt) {
      throw new NotFoundException('Membro não encontrado neste grupo');
    }

    // Não pode remover a si mesmo se for o único admin
    if (userId === adminUserId) {
      const adminCount = await this.prisma.groupMember.count({
        where: { groupId, isAdmin: true, leftAt: null },
      });

      if (adminCount <= 1) {
        throw new ForbiddenException('Não é possível sair do grupo. Você é o único administrador.');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true },
    });

    // Busca a tag institucional do grupo
    const groupTag = await this.prisma.tag.findFirst({
      where: { groupId, type: TagType.INSTITUTIONAL },
    });

    let lostConnectionsCount = 0;

    // Executa remoção em uma transação para garantir consistência
    await this.prisma.$transaction(async (tx) => {
      if (groupTag) {
        // Conta quantos contatos do usuário têm essa tag
        lostConnectionsCount = await tx.contactTag.count({
          where: {
            tagId: groupTag.id,
            contact: { ownerId: userId },
          },
        });

        // Remove a tag de todos os contatos do membro
        await tx.contactTag.deleteMany({
          where: {
            tagId: groupTag.id,
            contact: { ownerId: userId },
          },
        });
      }

      // Marca o membro como saído
      await tx.groupMember.update({
        where: { id: membership.id },
        data: { leftAt: new Date() },
      });
    });

    this.logger.log(
      `Membro ${user?.name} removido do grupo ${group.name}. Perdeu ${lostConnectionsCount} conexões.`,
    );

    // Envia notificação de escassez via WhatsApp (fora da transação)
    if (user?.phone && lostConnectionsCount > 0) {
      // Executa de forma assíncrona para não bloquear a resposta
      this.whatsappService
        .sendScarcityNotification(user.phone, group.name, lostConnectionsCount)
        .catch((err) => {
          this.logger.error(`Erro ao enviar notificação de escassez: ${err.message}`);
        });
    }

    return {
      message: `${user?.name || 'Membro'} removido do grupo ${group.name}`,
      lostConnectionsCount,
      userPhone: user?.phone,
      groupName: group.name,
    };
  }

  /**
   * Lista os membros de um grupo
   * Requer que o usuário seja membro do grupo
   */
  async getMembers(groupId: string, userId: string) {
    await this.ensureMember(groupId, userId);

    return this.prisma.groupMember.findMany({
      where: { groupId, leftAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /**
   * Agrega os contatos de todos os membros do grupo
   * (Para a empresa visualizar a rede de contatos dos membros)
   */
  async getGroupContacts(groupId: string, adminUserId: string) {
    await this.ensureAdmin(groupId, adminUserId);

    const members = await this.prisma.groupMember.findMany({
      where: { groupId, leftAt: null },
      select: { userId: true },
    });

    const memberIds = members.map((m) => m.userId);

    // Busca todos os contatos dos membros
    const contacts = await this.prisma.contact.findMany({
      where: { ownerId: { in: memberIds } },
      include: {
        owner: {
          select: { id: true, name: true },
        },
        tags: {
          include: {
            tag: {
              select: { id: true, name: true, color: true, type: true, isVerified: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Agrupa por nome/telefone para identificar contatos em comum
    const contactsMap = new Map<string, { contact: typeof contacts[0]; owners: string[] }>();

    for (const contact of contacts) {
      const key = contact.phone || contact.name.toLowerCase();
      const existing = contactsMap.get(key);

      if (existing) {
        existing.owners.push(contact.owner.name);
      } else {
        contactsMap.set(key, { contact, owners: [contact.owner.name] });
      }
    }

    return {
      totalMembers: memberIds.length,
      totalContacts: contacts.length,
      uniqueContacts: contactsMap.size,
      contacts: Array.from(contactsMap.values()).map(({ contact, owners }) => ({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
        position: contact.position,
        tags: contact.tags.map((t) => t.tag),
        sharedBy: owners,
        isShared: owners.length > 1,
      })),
    };
  }

  /**
   * Verifica se o usuário é membro do grupo
   */
  private async ensureMember(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!membership || membership.leftAt) {
      throw new ForbiddenException('Você não é membro deste grupo');
    }
  }

  /**
   * Verifica se o usuário é admin do grupo
   */
  private async ensureAdmin(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!membership || !membership.isAdmin || membership.leftAt) {
      throw new ForbiddenException('Apenas administradores do grupo podem realizar esta ação');
    }
  }
}
