import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ConnectionStrength } from '@prisma/client';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { GraphData, GraphNode, GraphEdge } from './types/graph.types';

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.connection.create({
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

    return this.prisma.connection.update({
      where: { id },
      data: dto,
      include: {
        contact: true,
      },
    });
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

  /**
   * Normaliza telefone para comparação
   * Remove caracteres, adiciona código país e lida com 9º dígito
   * Retorna array com variações possíveis para matching flexível
   */
  private normalizePhoneVariations(phone: string | null): string[] {
    if (!phone) return [];

    // Remove tudo que não é número
    let cleaned = phone.replace(/\D/g, '');

    // Se não começa com 55, adiciona
    if (!cleaned.startsWith('55') && cleaned.length >= 10) {
      cleaned = '55' + cleaned;
    }

    if (!cleaned || cleaned.length < 12) return [];

    const variations: string[] = [cleaned];

    // Se tem 13 dígitos (55 + DDD + 9 + número), cria versão sem o 9
    // Formato: 55 + DDD(2) + 9 + número(8) = 13 dígitos
    if (cleaned.length === 13 && cleaned[4] === '9') {
      const withoutNine = cleaned.slice(0, 4) + cleaned.slice(5);
      variations.push(withoutNine);
    }

    // Se tem 12 dígitos (55 + DDD + número), cria versão com o 9
    // Formato: 55 + DDD(2) + número(8) = 12 dígitos
    if (cleaned.length === 12) {
      const withNine = cleaned.slice(0, 4) + '9' + cleaned.slice(4);
      variations.push(withNine);
    }

    return variations;
  }

  async getGraph(userId: string, depth = 2): Promise<GraphData> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const visitedIds = new Set<string>();

    // Adiciona o usuário como nó central
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    nodes.push({
      id: userId,
      name: user.name,
      type: 'user',
      degree: 0,
    });

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
      console.log(`[GRAPH DEBUG] User ${u.id} phone variations:`, phoneVariations);
      for (const variation of phoneVariations) {
        phoneToUserMap.set(variation, u.id);
      }
    }
    console.log(`[GRAPH DEBUG] Phone map size: ${phoneToUserMap.size}`);

    for (const conn of firstDegreeConnections) {
      if (!visitedIds.has(conn.contactId)) {
        visitedIds.add(conn.contactId);

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
          company: conn.contact.company,
          position: conn.contact.position,
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
          console.log(`[GRAPH DEBUG] Contact ${conn.contact.name} phone: ${conn.contact.phone} -> variations:`, contactPhoneVariations);
          let linkedUserId: string | null = null;

          // Procura match em qualquer variação do telefone
          for (const variation of contactPhoneVariations) {
            console.log(`[GRAPH DEBUG] Checking variation ${variation}, exists in map: ${phoneToUserMap.has(variation)}`);
            if (phoneToUserMap.has(variation)) {
              linkedUserId = phoneToUserMap.get(variation)!;
              console.log(`[GRAPH DEBUG] MATCH! Linked to user ${linkedUserId}`);
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

                nodes.push({
                  id: secondDegreeId,
                  name: linkedConn.contact.name,
                  type: 'mentioned',
                  degree: 2,
                  tags: linkedConn.contact.tags.map((ct) => ({
                    id: ct.tag.id,
                    name: ct.tag.name,
                    color: ct.tag.color,
                  })),
                  company: linkedConn.contact.company,
                  position: linkedConn.contact.position,
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

              nodes.push({
                id: mentionedNodeId,
                name: mentioned.name,
                type: 'mentioned',
                degree: 2,
                tags: mentioned.tags.map((tagName) => ({
                  id: tagName,
                  name: tagName,
                  color: '#9ca3af',
                })),
                description: mentioned.description,
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

    return { nodes, edges };
  }

  async getSecondDegreeContacts(userId: string, search?: string) {
    // Busca contatos de 1º grau
    const firstDegreeContacts = await this.prisma.connection.findMany({
      where: { fromUserId: userId },
      select: { contactId: true },
    });

    const firstDegreeIds = firstDegreeContacts.map((c) => c.contactId);

    if (firstDegreeIds.length === 0) {
      return [];
    }

    // Busca usuários que têm conexões com os mesmos contatos
    const sharedConnections = await this.prisma.connection.findMany({
      where: {
        contactId: { in: firstDegreeIds },
        fromUserId: { not: userId },
      },
      select: { fromUserId: true, contactId: true },
    });

    const connectedUserIds = [...new Set(sharedConnections.map((c) => c.fromUserId))];

    if (connectedUserIds.length === 0) {
      return [];
    }

    // Busca contatos de 2º grau (contatos dos usuários conectados que não são do usuário)
    const myContactIds = await this.prisma.contact.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    const myIds = myContactIds.map((c) => c.id);

    const searchCondition = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { company: { contains: search, mode: 'insensitive' as const } },
            { notes: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    return this.prisma.contact.findMany({
      where: {
        ownerId: { in: connectedUserIds },
        id: { notIn: [...firstDegreeIds, ...myIds] },
        ...searchCondition,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      take: 50,
    });
  }
}
