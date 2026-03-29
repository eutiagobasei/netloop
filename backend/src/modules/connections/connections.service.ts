import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ConnectionStrength } from '@prisma/client';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { GraphData, GraphNode, GraphEdge, ClubInfo } from './types/graph.types';
import { PhoneUtil } from '@/common/utils/phone.util';
import { EmbeddingService } from '../ai/services/embedding.service';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async create(userId: string, dto: CreateConnectionDto) {
    // Verifica se o contato existe e pertence ao usuário
    const contact = await this.prisma.contact.findUnique({
      where: { id: dto.contactId },
    });

    if (!contact || contact.ownerId !== userId) {
      throw new NotFoundException('Contato não encontrado');
    }

    // Verifica se a conexão já existe
    const existing = await this.prisma.connection.findUnique({
      where: {
        fromUserId_contactId: {
          fromUserId: userId,
          contactId: dto.contactId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Conexão já existe com este contato');
    }

    const connection = await this.prisma.connection.create({
      data: {
        fromUserId: userId,
        contactId: dto.contactId,
        strength: dto.strength || ConnectionStrength.MODERATE,
        context: dto.context,
      },
      include: {
        contact: {
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
          },
        },
      },
    });

    // Gera embedding se houver contexto (async, não bloqueia)
    if (dto.context) {
      this.embeddingService.updateConnectionEmbedding(connection.id).catch((err) => {
        this.logger.error(`Erro ao gerar embedding para conexão ${connection.id}: ${err.message}`);
      });
    }

    return connection;
  }

  async findAll(userId: string) {
    return this.prisma.connection.findMany({
      where: { fromUserId: userId },
      include: {
        contact: {
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, userId: string, dto: UpdateConnectionDto) {
    const connection = await this.prisma.connection.findUnique({
      where: { id },
    });

    if (!connection || connection.fromUserId !== userId) {
      throw new NotFoundException('Conexão não encontrada');
    }

    const updated = await this.prisma.connection.update({
      where: { id },
      data: dto,
      include: {
        contact: true,
      },
    });

    // Regenera embedding se o contexto mudou
    if (dto.context !== undefined && dto.context !== connection.context) {
      if (dto.context) {
        this.embeddingService.updateConnectionEmbedding(id).catch((err) => {
          this.logger.error(`Erro ao regenerar embedding para conexão ${id}: ${err.message}`);
        });
      } else {
        // Se contexto foi removido, limpa o embedding
        this.prisma
          .$executeRawUnsafe(`UPDATE connections SET embedding = NULL WHERE id = $1`, id)
          .catch((err) => {
            this.logger.error(`Erro ao limpar embedding da conexão ${id}: ${err.message}`);
          });
      }
    }

    return updated;
  }

  async delete(id: string, userId: string) {
    const connection = await this.prisma.connection.findUnique({
      where: { id },
    });

    if (!connection || connection.fromUserId !== userId) {
      throw new NotFoundException('Conexão não encontrada');
    }

    await this.prisma.connection.delete({
      where: { id },
    });
  }

  private normalizePhoneVariations(phone: string | null): string[] {
    return PhoneUtil.getVariations(phone);
  }

  async getGraph(userId: string, depth = 2): Promise<GraphData> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const visitedIds = new Set<string>();

    // Adiciona o usuário como nó central (com seus clubes)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        clubMemberships: {
          where: { leftAt: null },
          include: {
            club: {
              select: { id: true, name: true, color: true, isVerified: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const userClubs: ClubInfo[] = user.clubMemberships.map((m) => ({
      id: m.club.id,
      name: m.club.name,
      color: m.club.color,
      isVerified: m.club.isVerified,
    }));

    nodes.push({
      id: userId,
      name: user.name,
      type: 'user',
      degree: 0,
      clubs: userClubs,
    });

    // Set para rastrear telefones de contatos de 1º grau (evita duplicatas com club_members)
    const processedPhones = new Set<string>();

    // Busca conexões de 1º grau (contatos diretos do usuário)
    const firstDegreeConnections = await this.prisma.connection.findMany({
      where: { fromUserId: userId },
      include: {
        contact: {
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
            mentionedConnections: true,
          },
        },
      },
    });

    // Busca todos os usuários para vincular por telefone
    const allUsers = await this.prisma.user.findMany({
      where: { id: { not: userId } },
      select: { id: true, phone: true },
    });

    // Cria mapa de todas as variações de telefone -> userId
    const phoneToUserMap = new Map<string, string>();
    for (const u of allUsers) {
      const phoneVariations = this.normalizePhoneVariations(u.phone);
      this.logger.log(`User ${u.id} phone variations: ${JSON.stringify(phoneVariations)}`);
      for (const variation of phoneVariations) {
        phoneToUserMap.set(variation, u.id);
      }
    }
    this.logger.log(
      `Phone map size: ${phoneToUserMap.size}, keys: ${Array.from(phoneToUserMap.keys()).join(', ')}`,
    );

    // === Shared contacts lookup ===
    // Collect all phones from first degree contacts and expand with variations
    const allPhoneVariations: string[] = [];
    const contactPhoneMap = new Map<string, string[]>(); // contactId -> variations

    for (const conn of firstDegreeConnections) {
      if (conn.contact.phone) {
        const variations = PhoneUtil.getVariations(conn.contact.phone);
        if (variations.length > 0) {
          contactPhoneMap.set(conn.contactId, variations);
          allPhoneVariations.push(...variations);
        }
      }
    }

    // === Club lookup for contacts ===
    // Find users by phone and their clubs
    const usersWithClubs =
      allPhoneVariations.length > 0
        ? await this.prisma.user.findMany({
            where: { phone: { in: allPhoneVariations } },
            select: {
              phone: true,
              clubMemberships: {
                where: { leftAt: null },
                select: {
                  club: {
                    select: { id: true, name: true, color: true, isVerified: true },
                  },
                },
              },
            },
          })
        : [];

    // Build map: phone variation -> clubs[]
    const phoneToClubsMap = new Map<string, ClubInfo[]>();
    for (const u of usersWithClubs) {
      if (!u.phone) continue;
      const clubs = u.clubMemberships.map((m) => m.club);
      const variations = PhoneUtil.getVariations(u.phone);
      for (const v of variations) {
        phoneToClubsMap.set(v, clubs);
      }
    }

    // Helper to get clubs for a contact by phone
    const getClubsForContact = (contactId: string): ClubInfo[] => {
      const variations = contactPhoneMap.get(contactId) || [];
      for (const v of variations) {
        const clubs = phoneToClubsMap.get(v);
        if (clubs && clubs.length > 0) return clubs;
      }
      return [];
    };
    // === End club lookup ===

    // Query contacts from OTHER users with matching phones
    const sharedContacts =
      allPhoneVariations.length > 0
        ? await this.prisma.contact.findMany({
            where: {
              ownerId: { not: userId },
              phone: { in: allPhoneVariations },
            },
            select: {
              phone: true,
              owner: { select: { id: true, name: true } },
            },
          })
        : [];

    // Build map: normalizedPhone -> { users[] }
    const sharedMap = new Map<string, { id: string; name: string }[]>();
    for (const sc of sharedContacts) {
      if (!sc.phone) continue;
      const scVariations = PhoneUtil.getVariations(sc.phone);
      for (const v of scVariations) {
        const existing = sharedMap.get(v) || [];
        if (!existing.some((u) => u.id === sc.owner.id)) {
          existing.push({ id: sc.owner.id, name: sc.owner.name });
        }
        sharedMap.set(v, existing);
      }
    }

    // Helper to find shared users for a contact
    const getSharedInfo = (
      contactId: string,
    ): {
      isShared: boolean;
      sharedByCount: number;
      sharedByUsers: { id: string; name: string }[];
    } => {
      const variations = contactPhoneMap.get(contactId) || [];
      const usersSet = new Map<string, { id: string; name: string }>();
      for (const v of variations) {
        const users = sharedMap.get(v) || [];
        for (const u of users) {
          usersSet.set(u.id, u);
        }
      }
      const sharedByUsers = Array.from(usersSet.values());
      return {
        isShared: sharedByUsers.length > 0,
        sharedByCount: sharedByUsers.length,
        sharedByUsers,
      };
    };
    // === End shared contacts lookup ===

    for (const conn of firstDegreeConnections) {
      if (!visitedIds.has(conn.contactId)) {
        visitedIds.add(conn.contactId);

        const shared = getSharedInfo(conn.contactId);
        const contactClubs = getClubsForContact(conn.contactId);

        // Rastreia telefone do contato para evitar duplicata com club_member
        if (conn.contact.phone) {
          PhoneUtil.getVariations(conn.contact.phone).forEach((v) => processedPhones.add(v));
        }

        nodes.push({
          id: conn.contactId,
          name: conn.contact.name,
          type: 'contact',
          degree: 1,
          tags: conn.contact.tags.map((ct) => ({
            id: ct.tag.id,
            name: ct.tag.name,
            color: ct.tag.color,
          })),
          clubs: contactClubs,
          phone: conn.contact.phone,
          email: conn.contact.email,
          context: conn.context, // Contexto da CONEXÃO (como você conhece a pessoa)
          notes: conn.contact.notes, // Notas sobre o contato
          location: conn.contact.location,
          // REMOVIDO: sharedByUsers - não mostra quem mais conhece este contato
          // Isso violava privacidade ao expor nomes de outros usuários
        });

        edges.push({
          source: userId,
          target: conn.contactId,
          strength: conn.strength,
        });

        // Se depth >= 2, busca conexões de 2º nível
        if (depth >= 2) {
          // 1. Verifica se o contato tem telefone que corresponde a um usuário
          const contactPhoneVariations = this.normalizePhoneVariations(conn.contact.phone);
          this.logger.log(
            `Contact ${conn.contact.name} phone: ${conn.contact.phone} -> variations: ${JSON.stringify(contactPhoneVariations)}`,
          );
          let linkedUserId: string | null = null;

          // Procura match em qualquer variação do telefone
          for (const variation of contactPhoneVariations) {
            this.logger.log(
              `Checking variation ${variation}, exists in map: ${phoneToUserMap.has(variation)}`,
            );
            if (phoneToUserMap.has(variation)) {
              linkedUserId = phoneToUserMap.get(variation)!;
              this.logger.log(`MATCH! Contact linked to user ${linkedUserId}`);
              break;
            }
          }

          if (linkedUserId) {
            // Busca os contatos desse usuário vinculado (2º nível)
            const linkedUserContacts = await this.prisma.connection.findMany({
              where: { fromUserId: linkedUserId },
              include: {
                contact: {
                  include: {
                    tags: { include: { tag: true } },
                  },
                },
              },
              take: 20, // Limita para não sobrecarregar
            });

            for (const linkedConn of linkedUserContacts) {
              const secondDegreeId = `linked-${linkedConn.contactId}`;

              if (!visitedIds.has(secondDegreeId) && !visitedIds.has(linkedConn.contactId)) {
                visitedIds.add(secondDegreeId);

                // PRIVACIDADE: Conexões de 2º grau NÃO mostram NENHUM dado
                // Apenas exibe o círculo de ligação sem nome ou detalhes
                // O usuário precisa pedir apresentação ao contato de 1º grau
                nodes.push({
                  id: secondDegreeId,
                  name: '', // Sem nome
                  type: 'mentioned',
                  degree: 2,
                  tags: [], // Sem tags
                  company: null,
                  position: null,
                  phone: null,
                  email: null,
                  context: null,
                  location: null,
                });

                edges.push({
                  source: conn.contactId,
                  target: secondDegreeId,
                  strength: 'WEAK' as ConnectionStrength,
                });
              }
            }
          }

          // 2. Também adiciona MentionedConnections (pessoas mencionadas manualmente)
          for (const mentioned of conn.contact.mentionedConnections) {
            const mentionedNodeId = `mentioned-${mentioned.id}`;

            if (!visitedIds.has(mentionedNodeId)) {
              visitedIds.add(mentionedNodeId);

              // PRIVACIDADE: Mencionados também são 2º grau - não expõe NENHUM dado
              // Apenas exibe o círculo de ligação sem nome ou detalhes
              nodes.push({
                id: mentionedNodeId,
                name: '', // Sem nome
                type: 'mentioned',
                degree: 2,
                tags: [], // Sem tags
                description: null,
                phone: null,
              });

              edges.push({
                source: conn.contactId,
                target: mentionedNodeId,
                strength: 'WEAK' as ConnectionStrength,
              });
            }
          }
        }
      }
    }

    // === Adiciona membros de clubes como conexões de 1º grau ===
    // Para cada clube do usuário, busca outros membros ativos
    for (const club of userClubs) {
      // Busca membros do clube (exceto o próprio usuário)
      const clubMembers = await this.prisma.clubMember.findMany({
        where: {
          clubId: club.id,
          userId: { not: userId },
          leftAt: null, // Apenas membros ativos
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
        },
        take: 100, // Limita para não sobrecarregar o grafo
      });

      for (const member of clubMembers) {
        // Pula se já existe como contato (baseado no telefone)
        const memberPhoneVariations = PhoneUtil.getVariations(member.user.phone);
        const alreadyContact = memberPhoneVariations.some((v) => processedPhones.has(v));

        if (alreadyContact) {
          continue; // Já é contato manual, não criar nó duplicado
        }

        // Cria ID único para este membro de clube
        const clubMemberId = `club-${club.id}-${member.userId}`;

        // Pula se já processado (pode ser membro de múltiplos clubes em comum)
        if (visitedIds.has(clubMemberId) || visitedIds.has(member.userId)) {
          continue;
        }

        visitedIds.add(clubMemberId);

        // Adiciona telefone às variações processadas para evitar duplicatas
        memberPhoneVariations.forEach((v) => processedPhones.add(v));

        // Cria nó do membro
        nodes.push({
          id: clubMemberId,
          name: member.user.name,
          type: 'club_member',
          degree: 1,
          clubs: [
            {
              id: club.id,
              name: club.name,
              color: club.color,
              isVerified: club.isVerified,
            },
          ],
          phone: member.user.phone,
          email: member.user.email,
          // context vazio - a relação é definida pelo clube
        });

        // Cria edge com a cor do clube
        edges.push({
          source: userId,
          target: clubMemberId,
          strength: 'CLUB',
          clubColor: club.color,
        });
      }
    }
    // === Fim membros de clubes ===

    return { nodes, edges };
  }

  async getSecondDegreeContacts(userId: string, search?: string) {
    // PRIVACIDADE: Conexões de 2º grau servem apenas para descobrir
    // quem do seu 1º grau pode te conectar com alguém de uma área/profissão
    // NÃO expõe dados pessoais do contato de 2º grau

    this.logger.log(`[2º grau] Buscando para userId=${userId}, search="${search}"`);

    if (!search) {
      // Sem busca, não retorna nada - precisa de um termo de busca
      return [];
    }

    // Busca contatos de 1º grau
    const firstDegreeContacts = await this.prisma.connection.findMany({
      where: { fromUserId: userId },
      include: {
        contact: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    this.logger.log(`[2º grau] Conexões de 1º grau: ${firstDegreeContacts.length}`);

    if (firstDegreeContacts.length === 0) {
      return [];
    }

    // Monta mapa de phone -> contato de 1º grau (com variações)
    // Guarda também o telefone original do contato (que pode ter 9º dígito)
    const phoneToFirstDegree = new Map<string, { id: string; name: string; phone: string }>();
    const allPhoneVariations: string[] = [];

    for (const conn of firstDegreeContacts) {
      if (conn.contact.phone) {
        const variations = PhoneUtil.getVariations(conn.contact.phone);
        this.logger.log(
          `[2º grau] Contato ${conn.contact.name}: ${conn.contact.phone} → variações: ${variations.join(', ')}`,
        );
        for (const v of variations) {
          phoneToFirstDegree.set(v, {
            id: conn.contact.id,
            name: conn.contact.name,
            phone: conn.contact.phone,
          });
          allPhoneVariations.push(v);
        }
      }
    }

    // Busca usuários que são meus contatos de 1º grau (pelo telefone com variações)
    const connectedUsers = await this.prisma.user.findMany({
      where: {
        phone: { in: allPhoneVariations },
        id: { not: userId },
      },
      select: { id: true, name: true, phone: true },
    });

    this.logger.log(
      `[2º grau] Usuários conectados encontrados: ${connectedUsers.length} - ${connectedUsers.map((u) => `${u.name}(${u.phone})`).join(', ')}`,
    );

    if (connectedUsers.length === 0) {
      this.logger.log(
        `[2º grau] Nenhum usuário conectado encontrado com os telefones: ${allPhoneVariations.slice(0, 5).join(', ')}...`,
      );
      return [];
    }

    const connectedUserIds = connectedUsers.map((u) => u.id);

    // Busca contatos de 2º grau que matcham a busca (por área/profissão)
    // Divide a busca em palavras para encontrar matches parciais
    const searchWords = search
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    this.logger.log(`[2º grau] Palavras de busca: ${searchWords.join(', ')}`);

    // Cria condições OR para cada palavra em cada campo
    const searchConditions = searchWords.flatMap((word) => [
      { professionalInfo: { contains: word, mode: 'insensitive' as const } },
      { relationshipContext: { contains: word, mode: 'insensitive' as const } },
      { notes: { contains: word, mode: 'insensitive' as const } },
      { name: { contains: word, mode: 'insensitive' as const } },
    ]);

    const secondDegreeContacts = await this.prisma.contact.findMany({
      where: {
        ownerId: { in: connectedUserIds },
        OR:
          searchConditions.length > 0
            ? searchConditions
            : [
                { professionalInfo: { contains: search, mode: 'insensitive' as const } },
                { relationshipContext: { contains: search, mode: 'insensitive' as const } },
                { notes: { contains: search, mode: 'insensitive' as const } },
              ],
      },
      select: {
        id: true,
        context: true,
        ownerId: true,
        owner: {
          select: { id: true, name: true, phone: true },
        },
      },
      take: 20,
    });

    this.logger.log(`[2º grau] Contatos de 2º grau encontrados: ${secondDegreeContacts.length}`);

    // Retorna apenas: área/profissão + quem pode conectar (sem dados pessoais)
    return secondDegreeContacts.map((c) => {
      // Encontra qual contato de 1º grau pode fazer a conexão
      const ownerPhone = c.owner.phone;
      const connector = ownerPhone
        ? phoneToFirstDegree.get(ownerPhone) ||
          phoneToFirstDegree.get(PhoneUtil.normalize(ownerPhone) || '')
        : null;

      // Determina a área do contexto ou fallback
      const area = c.context || 'Área não especificada';

      // Usa o telefone do USUÁRIO (ownerPhone) pois é o número cadastrado no WhatsApp
      // O telefone do contato pode ter formato diferente (ex: com 9º dígito)
      const connectorPhone = ownerPhone;
      this.logger.log(
        `[2º grau] Retornando connector: name=${connector?.name}, ownerPhone=${ownerPhone}`,
      );

      return {
        id: c.id,
        area, // Mostra contexto
        connectorName: connector?.name || c.owner.name, // Quem pode conectar
        connectorId: connector?.id || null,
        // Usa o telefone do usuário (WhatsApp real)
        connectorPhone,
        // NÃO expõe: nome, telefone, email do contato de 2º grau
      };
    });
  }

  /**
   * Busca contatos de 2º grau para Chain Search (raciocínio em cadeia)
   * Retorna dados no formato esperado pelo ChainSearchService
   */
  async getSecondDegreeContactsForChainSearch(
    userId: string,
    query: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      area?: string;
      connectorId: string;
      connectorName: string;
      connectorPhone: string | null;
    }>
  > {
    this.logger.log(`[Chain Search 2º grau] userId=${userId}, query="${query}"`);

    // Busca contatos de 1º grau
    const firstDegreeContacts = await this.prisma.connection.findMany({
      where: { fromUserId: userId },
      include: {
        contact: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    if (firstDegreeContacts.length === 0) {
      return [];
    }

    // Monta mapa de phone -> contato de 1º grau
    const phoneToFirstDegree = new Map<string, { id: string; name: string; phone: string }>();
    const allPhoneVariations: string[] = [];

    for (const conn of firstDegreeContacts) {
      if (conn.contact.phone) {
        const variations = PhoneUtil.getVariations(conn.contact.phone);
        for (const v of variations) {
          phoneToFirstDegree.set(v, {
            id: conn.contact.id,
            name: conn.contact.name,
            phone: conn.contact.phone,
          });
          allPhoneVariations.push(v);
        }
      }
    }

    // Busca usuários que são meus contatos de 1º grau
    const connectedUsers = await this.prisma.user.findMany({
      where: {
        phone: { in: allPhoneVariations },
        id: { not: userId },
      },
      select: { id: true, name: true, phone: true },
    });

    if (connectedUsers.length === 0) {
      return [];
    }

    const connectedUserIds = connectedUsers.map((u) => u.id);

    // Busca todos os contatos dos usuários conectados (sem filtro de busca)
    // O filtro semântico será feito pela IA
    const secondDegreeContacts = await this.prisma.contact.findMany({
      where: {
        ownerId: { in: connectedUserIds },
      },
      select: {
        id: true,
        name: true,
        context: true,
        notes: true,
        professionalInfo: true,
        ownerId: true,
        owner: {
          select: { id: true, name: true, phone: true },
        },
      },
      take: 30, // Limita para não exceder tokens da IA
    });

    this.logger.log(`[Chain Search 2º grau] Encontrados: ${secondDegreeContacts.length}`);

    return secondDegreeContacts.map((c) => {
      const ownerPhone = c.owner.phone;
      const connector = ownerPhone
        ? phoneToFirstDegree.get(ownerPhone) ||
          phoneToFirstDegree.get(PhoneUtil.normalize(ownerPhone) || '')
        : null;

      // Concatena contexto + notas + professionalInfo para área
      const areaParts = [c.context, c.professionalInfo, c.notes].filter(Boolean);
      const area = areaParts.join(' | ') || undefined;

      return {
        id: c.id,
        name: c.name,
        area,
        connectorId: connector?.id || c.owner.id,
        connectorName: connector?.name || c.owner.name,
        connectorPhone: ownerPhone,
      };
    });
  }
}
