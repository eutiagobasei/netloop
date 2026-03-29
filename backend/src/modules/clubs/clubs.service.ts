import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CreateClubDto,
  UpdateClubDto,
  AddMemberDto,
  AddMemberByPhoneDto,
  AddMemberByPhoneResponseDto,
  ImportInvitesDto,
  ImportInvitesResponseDto,
} from './dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SlugUtil } from '@/common/utils/slug.util';

@Injectable()
export class ClubsService {
  private readonly logger = new Logger(ClubsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  /**
   * Cria um novo clube
   */
  async create(adminUserId: string, dto: CreateClubDto) {
    const slug = SlugUtil.generate(dto.name);

    const existing = await this.prisma.club.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
    });

    if (existing) {
      throw new ConflictException('Já existe um clube com esse nome');
    }

    // Cria o clube e adiciona o criador como admin
    const club = await this.prisma.$transaction(async (tx) => {
      const newClub = await tx.club.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          color: dto.color,
          isVerified: dto.isVerified ?? false,
        },
      });

      // Adiciona o criador como admin (membro do clube)
      await tx.clubMember.create({
        data: {
          userId: adminUserId,
          clubId: newClub.id,
          isAdmin: true,
        },
      });

      return newClub;
    });

    this.logger.log(`Clube criado: ${club.name} (ID: ${club.id}) por usuário ${adminUserId}`);

    return this.findById(club.id);
  }

  /**
   * Lista todos os clubes ativos
   */
  async findAll(includeInactive = false) {
    return this.prisma.club.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: {
          select: { members: { where: { leftAt: null } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Busca um clube pelo ID
   * Requer que o usuário seja membro do clube para ver detalhes completos
   */
  async findById(id: string, userId?: string) {
    const club = await this.prisma.club.findUnique({
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
        _count: {
          select: { members: { where: { leftAt: null } } },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Clube não encontrado');
    }

    // Se userId foi fornecido, verifica se é membro do clube
    if (userId) {
      const isMember = club.members.some((m) => m.user.id === userId);
      if (!isMember) {
        // Retorna versão limitada sem dados sensíveis
        return {
          id: club.id,
          name: club.name,
          slug: club.slug,
          description: club.description,
          isVerified: club.isVerified,
          color: club.color,
          isActive: club.isActive,
          _count: club._count,
          members: [], // Não expõe membros para não-membros
        };
      }
    }

    return club;
  }

  /**
   * Atualiza um clube
   */
  async update(id: string, userId: string, dto: UpdateClubDto) {
    await this.ensureAdmin(id, userId);

    const club = await this.findById(id);

    const data: Partial<UpdateClubDto> & { slug?: string } = { ...dto };

    // Se mudar o nome, atualiza também o slug
    if (dto.name && dto.name !== club.name) {
      data.slug = SlugUtil.generate(dto.name);
    }

    await this.prisma.club.update({
      where: { id },
      data,
    });

    return this.findById(id);
  }

  /**
   * Adiciona um membro ao clube
   */
  async addMember(clubId: string, adminUserId: string, dto: AddMemberDto) {
    await this.ensureAdmin(clubId, adminUserId);

    const club = await this.findById(clubId);

    // Verifica se o usuário existe
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, name: true, phone: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verifica se já é membro
    const existingMembership = await this.prisma.clubMember.findUnique({
      where: { userId_clubId: { userId: dto.userId, clubId } },
    });

    if (existingMembership && !existingMembership.leftAt) {
      throw new ConflictException('Usuário já é membro deste clube');
    }

    // Se tinha saído antes, reativa a membership
    if (existingMembership) {
      await this.prisma.clubMember.update({
        where: { id: existingMembership.id },
        data: {
          leftAt: null,
          isAdmin: dto.isAdmin ?? false,
          joinedAt: new Date(),
        },
      });
    } else {
      await this.prisma.clubMember.create({
        data: {
          userId: dto.userId,
          clubId,
          isAdmin: dto.isAdmin ?? false,
        },
      });
    }

    this.logger.log(`Membro ${user.name} adicionado ao clube ${club.name}`);

    return { message: `${user.name} adicionado ao clube ${club.name}` };
  }

  /**
   * Adiciona um membro ao clube por telefone
   * Se o usuário já existe, adiciona direto. Se não, cria convite e envia notificação.
   */
  async addMemberByPhone(
    clubId: string,
    adminUserId: string,
    dto: AddMemberByPhoneDto,
  ): Promise<AddMemberByPhoneResponseDto> {
    await this.ensureAdmin(clubId, adminUserId);

    const club = await this.findById(clubId);
    const normalizedPhone = this.normalizePhone(dto.phone);

    // Verifica se já é membro
    const existingMember = await this.prisma.clubMember.findFirst({
      where: {
        clubId,
        user: { phone: normalizedPhone },
        leftAt: null,
      },
    });

    if (existingMember) {
      throw new ConflictException('Já é membro deste clube');
    }

    // Verifica se usuário existe
    const user = await this.prisma.user.findFirst({
      where: { phone: normalizedPhone },
    });

    if (user) {
      // Usuário existe → adiciona direto
      await this.addMember(clubId, adminUserId, { userId: user.id });
      return { status: 'added', message: `${user.name} adicionado ao clube` };
    }

    // Usuário não existe → cria convite e notifica
    await this.prisma.clubInvite.upsert({
      where: { clubId_phone: { clubId, phone: normalizedPhone } },
      create: {
        clubId,
        name: dto.name.trim(),
        phone: normalizedPhone,
        company: dto.company?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        status: 'PENDING',
      },
      update: {
        name: dto.name.trim(),
        company: dto.company?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        status: 'PENDING',
      },
    });

    // Envia notificação via WhatsApp
    const sent = await this.whatsappService.sendSealNotification(normalizedPhone, club.name);

    if (sent) {
      await this.prisma.clubInvite.update({
        where: { clubId_phone: { clubId, phone: normalizedPhone } },
        data: { status: 'NOTIFIED', invitedAt: new Date() },
      });
    }

    this.logger.log(
      `Convite criado para ${dto.name} (${normalizedPhone}) no clube ${club.name}. ` +
        `Notificação ${sent ? 'enviada' : 'não enviada'}.`,
    );

    return { status: 'invited', message: `${dto.name} será adicionado quando se cadastrar` };
  }

  /**
   * Remove um membro do clube
   */
  async removeMember(clubId: string, adminUserId: string, userId: string) {
    await this.ensureAdmin(clubId, adminUserId);

    const club = await this.findById(clubId);

    const membership = await this.prisma.clubMember.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });

    if (!membership || membership.leftAt) {
      throw new NotFoundException('Membro não encontrado neste clube');
    }

    // Não pode remover a si mesmo se for o único admin
    if (userId === adminUserId) {
      const adminCount = await this.prisma.clubMember.count({
        where: { clubId, isAdmin: true, leftAt: null },
      });

      if (adminCount <= 1) {
        throw new ForbiddenException('Não é possível sair do clube. Você é o único administrador.');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true },
    });

    // Marca o membro como saído
    await this.prisma.clubMember.update({
      where: { id: membership.id },
      data: { leftAt: new Date() },
    });

    this.logger.log(`Membro ${user?.name} removido do clube ${club.name}`);

    return {
      message: `${user?.name || 'Membro'} removido do clube ${club.name}`,
    };
  }

  /**
   * Lista os membros de um clube
   * Requer que o usuário seja membro do clube
   */
  async getMembers(clubId: string, userId: string) {
    await this.ensureMember(clubId, userId);

    return this.prisma.clubMember.findMany({
      where: { clubId, leftAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /**
   * Agrega os contatos de todos os membros do clube
   * (Para a empresa visualizar a rede de contatos dos membros)
   */
  async getClubContacts(clubId: string, adminUserId: string) {
    await this.ensureAdmin(clubId, adminUserId);

    const members = await this.prisma.clubMember.findMany({
      where: { clubId, leftAt: null },
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
              select: { id: true, name: true, color: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Agrupa por nome/telefone para identificar contatos em comum
    const contactsMap = new Map<string, { contact: (typeof contacts)[0]; owners: string[] }>();

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
        context: contact.context,
        tags: contact.tags.map((t) => t.tag),
        sharedBy: owners,
        isShared: owners.length > 1,
      })),
    };
  }

  /**
   * Verifica se o usuário é membro do clube
   */
  private async ensureMember(clubId: string, userId: string) {
    const membership = await this.prisma.clubMember.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });

    if (!membership || membership.leftAt) {
      throw new ForbiddenException('Você não é membro deste clube');
    }
  }

  /**
   * Verifica se o usuário é admin do clube
   */
  async ensureAdmin(clubId: string, userId: string) {
    const membership = await this.prisma.clubMember.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });

    if (!membership || !membership.isAdmin || membership.leftAt) {
      throw new ForbiddenException('Apenas administradores do clube podem realizar esta ação');
    }
  }

  /**
   * Importa convites em massa a partir de dados de planilha
   * Se o telefone pertence a um usuário existente, adiciona direto como membro.
   * Se não, cria convite e envia notificação via WhatsApp.
   */
  async importInvites(
    clubId: string,
    adminUserId: string,
    dto: ImportInvitesDto,
  ): Promise<ImportInvitesResponseDto> {
    await this.ensureAdmin(clubId, adminUserId);

    const club = await this.findById(clubId);

    const result: ImportInvitesResponseDto = {
      created: 0,
      addedDirectly: 0,
      duplicates: 0,
      alreadyMembers: 0,
      errors: [],
    };

    // Busca membros atuais do clube para verificar quem já é membro
    const existingMembers = await this.prisma.clubMember.findMany({
      where: { clubId, leftAt: null },
      include: {
        user: { select: { phone: true } },
      },
    });

    const memberPhones = new Set(
      existingMembers.filter((m) => m.user.phone).map((m) => this.normalizePhone(m.user.phone!)),
    );

    // Busca convites existentes para este clube
    const existingInvites = await this.prisma.clubInvite.findMany({
      where: { clubId },
      select: { phone: true },
    });

    const existingInvitePhones = new Set(existingInvites.map((i) => i.phone));

    // Busca todos os usuários existentes para verificar quem já está cadastrado
    const allUsers = await this.prisma.user.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true, name: true },
    });

    const usersByPhone = new Map(
      allUsers.filter((u) => u.phone).map((u) => [this.normalizePhone(u.phone!), u]),
    );

    // Processa cada convite
    for (let i = 0; i < dto.invites.length; i++) {
      const invite = dto.invites[i];
      const lineNum = i + 1;

      try {
        const normalizedPhone = this.normalizePhone(invite.phone);

        // Verifica se já é membro
        if (memberPhones.has(normalizedPhone)) {
          result.alreadyMembers++;
          continue;
        }

        // Verifica se já existe convite pendente
        if (existingInvitePhones.has(normalizedPhone)) {
          result.duplicates++;
          continue;
        }

        // Verifica se usuário já existe no sistema
        const existingUser = usersByPhone.get(normalizedPhone);

        if (existingUser) {
          // Usuário existe → adiciona direto como membro
          await this.addMember(clubId, adminUserId, { userId: existingUser.id });
          memberPhones.add(normalizedPhone); // Evita duplicatas
          result.addedDirectly++;
          this.logger.log(
            `Usuário existente ${existingUser.name} adicionado direto ao clube ${club.name}`,
          );
        } else {
          // Usuário não existe → cria convite e notifica
          await this.prisma.clubInvite.create({
            data: {
              clubId,
              name: invite.name.trim(),
              phone: normalizedPhone,
              company: invite.company?.trim() || null,
              companyDescription: invite.companyDescription?.trim() || null,
              status: 'PENDING',
            },
          });

          // Envia notificação via WhatsApp (async, não bloqueia)
          this.whatsappService
            .sendSealNotification(normalizedPhone, club.name)
            .then(async (sent) => {
              if (sent) {
                await this.prisma.clubInvite.update({
                  where: { clubId_phone: { clubId, phone: normalizedPhone } },
                  data: { status: 'NOTIFIED', invitedAt: new Date() },
                });
              }
            })
            .catch((err) => {
              this.logger.error(`Erro ao enviar notificação de selo: ${err.message}`);
            });

          existingInvitePhones.add(normalizedPhone);
          result.created++;
        }
      } catch (error) {
        // Em caso de erro de constraint unique (race condition)
        if ((error as any).code === 'P2002') {
          result.duplicates++;
        } else {
          result.errors.push(`Linha ${lineNum}: Erro ao processar ${invite.name}`);
          this.logger.error(`Erro ao importar convite linha ${lineNum}: ${error}`);
        }
      }
    }

    this.logger.log(
      `Importação de convites para clube ${club.name}: ${result.created} convites criados, ` +
        `${result.addedDirectly} adicionados direto, ${result.duplicates} duplicados, ` +
        `${result.alreadyMembers} já membros`,
    );

    return result;
  }

  /**
   * Normaliza telefone removendo formatação
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
