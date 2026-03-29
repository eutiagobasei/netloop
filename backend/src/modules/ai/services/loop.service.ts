import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { SettingsService } from '../../settings/settings.service';
import { PrismaService } from '@/prisma/prisma.service';
import { DEFAULT_PROMPTS, AI_CONFIG, PromptKey } from '../constants/default-prompts';
import {
  LoopPlanResponse,
  LoopNetworkData,
  LoopContact,
  LoopActionItem,
  LoopGap,
} from '../dto/loop.dto';
import {
  ConnectionStrength,
  Connection,
  Contact,
  ContactTag,
  Tag,
  MentionedConnection,
} from '@prisma/client';

/**
 * Maximum contacts to include in AI analysis.
 * Limited to 50 to:
 * 1. Keep prompt within token limits (~2000 tokens)
 * 2. Reduce API costs per request
 * 3. Ensure reasonable response time (<10s)
 */
const MAX_CONTACTS_TO_ANALYZE = 50;

/**
 * Type for connection with full contact data from Prisma query
 */
type ConnectionWithContact = Connection & {
  contact: Contact & {
    tags: (ContactTag & { tag: Tag })[];
    mentionedConnections: MentionedConnection[];
  };
};

@Injectable()
export class LoopService {
  private readonly logger = new Logger(LoopService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Obtém um prompt do banco de dados ou retorna o padrão
   */
  private async getPrompt(key: PromptKey): Promise<string> {
    try {
      const setting = await this.settingsService.getDecryptedValue(`prompt_${key}`);
      return setting || DEFAULT_PROMPTS[key];
    } catch {
      return DEFAULT_PROMPTS[key];
    }
  }

  /**
   * Monta os dados da rede do usuário formatados para o Loop
   */
  async assembleNetworkData(userId: string): Promise<LoopNetworkData> {
    // Busca dados do usuário
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      throw new BadRequestException('Usuário não encontrado');
    }

    // Busca conexões de 1º grau com dados completos
    const connections = await this.prisma.connection.findMany({
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
      orderBy: [
        { strength: 'desc' }, // STRONG > MODERATE > WEAK
        { createdAt: 'desc' },
      ],
    });

    const totalContacts = connections.length;

    // Prioriza contatos por força da conexão
    const prioritizedConnections = this.prioritizeConnections(connections);
    const limitedConnections = prioritizedConnections.slice(0, MAX_CONTACTS_TO_ANALYZE);

    const contacts: LoopContact[] = [];

    // Transforma contatos de 1º grau
    for (const conn of limitedConnections) {
      contacts.push(this.transformFirstDegreeContact(conn.contact, conn));
    }

    // Adiciona contatos de 2º grau (MentionedConnections) dos contatos limitados
    for (const conn of limitedConnections) {
      for (const mentioned of conn.contact.mentionedConnections) {
        contacts.push(this.transformSecondDegreeContact(mentioned, conn.contact));
      }
    }

    return {
      userProfile: {
        name: user.name,
        email: user.email,
      },
      contacts,
      totalContacts,
      analyzedContacts: limitedConnections.length,
    };
  }

  /**
   * Sanitizes user input to prevent prompt injection
   */
  private sanitizeUserInput(input: string): string {
    return input
      .replace(/\{\{/g, '{ {')
      .replace(/\}\}/g, '} }')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Prioriza conexões por força: STRONG > MODERATE > WEAK
   */
  private prioritizeConnections(connections: ConnectionWithContact[]): ConnectionWithContact[] {
    const strengthOrder: Record<ConnectionStrength, number> = {
      STRONG: 3,
      MODERATE: 2,
      WEAK: 1,
    };

    return [...connections].sort((a, b) => {
      const strengthDiff = (strengthOrder[b.strength] || 0) - (strengthOrder[a.strength] || 0);
      if (strengthDiff !== 0) return strengthDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Transforma um contato de 1º grau para o formato do Loop
   */
  private transformFirstDegreeContact(
    contact: ConnectionWithContact['contact'],
    connection: ConnectionWithContact,
  ): LoopContact {
    // Combina todas as informações relevantes para dar contexto à IA
    const contextParts: string[] = [];
    if (contact.professionalInfo) contextParts.push(`Profissional: ${contact.professionalInfo}`);
    if (connection.context) contextParts.push(`Contexto: ${connection.context}`);
    if (contact.relationshipContext) contextParts.push(`Relacionamento: ${contact.relationshipContext}`);
    if (contact.context) contextParts.push(`Info: ${contact.context}`);
    if (contact.notes) contextParts.push(`Notas: ${contact.notes}`);

    const combinedNotes = contextParts.length > 0 ? contextParts.join(' | ') : null;

    return {
      id: contact.id,
      name: contact.name,
      profession: contact.professionalInfo || '', // Campo unificado de info profissional
      skills: contact.tags?.map((ct) => ct.tag.name) || [],
      level: 1,
      connected_through: null,
      last_interaction: null,
      interaction_notes: combinedNotes,
    };
  }

  /**
   * Transforma um contato de 2º grau (MentionedConnection) para o formato do Loop
   */
  private transformSecondDegreeContact(
    mentioned: MentionedConnection,
    bridgeContact: Contact,
  ): LoopContact {
    return {
      id: mentioned.id,
      name: mentioned.name,
      profession: mentioned.description || '',
      skills: mentioned.tags || [],
      level: 2,
      connected_through: bridgeContact.name,
      last_interaction: null,
      interaction_notes: mentioned.description || null,
    };
  }

  /**
   * Gera o plano estratégico do Loop
   */
  async generatePlan(userId: string, goal: string): Promise<LoopPlanResponse> {
    this.logger.log(`Gerando plano Loop para usuário ${userId}`);

    // Sanitize user input to prevent prompt injection
    const sanitizedGoal = this.sanitizeUserInput(goal);

    // Obtém dados da rede
    const networkData = await this.assembleNetworkData(userId);

    if (networkData.contacts.length === 0) {
      return {
        goal: sanitizedGoal,
        decomposedNeeds: [],
        actionPlan: [],
        gaps: [
          {
            need: 'Rede de contatos',
            description:
              'Você ainda não possui contatos cadastrados. Adicione contatos à sua rede para que o Loop possa criar um plano de ação estratégico.',
          },
        ],
        generatedAt: new Date().toISOString(),
        contactsAnalyzed: 0,
        totalContacts: 0,
      };
    }

    // Obtém e prepara o prompt
    const systemPrompt = await this.getPrompt('loop_strategy');
    const preparedPrompt = this.preparePrompt(systemPrompt, networkData, sanitizedGoal);

    // Chama a API do OpenAI
    const client = await this.openaiService.getClient();

    const response = await client.chat.completions.create({
      model: AI_CONFIG.DEFAULT_MODEL,
      messages: [
        { role: 'system', content: preparedPrompt },
        { role: 'user', content: `Meu objetivo: ${sanitizedGoal}` },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da IA');
    }

    this.logger.debug(`Resposta da IA recebida (${content.length} chars)`);

    // Parse da resposta
    const parsed = this.parseLoopResponse(content, sanitizedGoal);

    return {
      ...parsed,
      generatedAt: new Date().toISOString(),
      contactsAnalyzed: networkData.analyzedContacts,
      totalContacts: networkData.totalContacts,
    };
  }

  /**
   * Prepara o prompt substituindo placeholders
   */
  private preparePrompt(prompt: string, networkData: LoopNetworkData, goal: string): string {
    // Formata os contatos de 1º grau
    const firstDegreeContacts = networkData.contacts.filter((c) => c.level === 1);
    const secondDegreeContacts = networkData.contacts.filter((c) => c.level === 2);

    const contactsJson = JSON.stringify(
      firstDegreeContacts.map((c) => ({
        id: c.id,
        name: c.name,
        profession: c.profession,
        skills: c.skills,
        context_and_notes: c.interaction_notes, // Contexto completo incluindo notas
      })),
      null,
      2,
    );

    const secondDegreeJson =
      secondDegreeContacts.length > 0
        ? JSON.stringify(
            secondDegreeContacts.map((c) => ({
              id: c.id,
              name: c.name,
              profession: c.profession,
              connected_through: c.connected_through,
            })),
            null,
            2,
          )
        : '[]';

    return prompt
      .replace(/\{\{userProfile\}\}/g, JSON.stringify(networkData.userProfile))
      .replace(/\{\{contacts\}\}/g, contactsJson)
      .replace(/\{\{secondDegreeContacts\}\}/g, secondDegreeJson)
      .replace(/\{\{goal\}\}/g, goal)
      .replace(/\{\{analyzedCount\}\}/g, String(networkData.analyzedContacts))
      .replace(/\{\{totalCount\}\}/g, String(networkData.totalContacts));
  }

  /**
   * Faz parse da resposta da IA e valida a estrutura
   */
  private parseLoopResponse(
    content: string,
    goal: string,
  ): Omit<LoopPlanResponse, 'generatedAt' | 'contactsAnalyzed' | 'totalContacts'> {
    try {
      const parsed = JSON.parse(content);

      // Extrai e valida campos
      const decomposedNeeds: string[] = Array.isArray(parsed.decomposedNeeds)
        ? parsed.decomposedNeeds.filter((n: any) => typeof n === 'string')
        : [];

      const actionPlan: LoopActionItem[] = Array.isArray(parsed.actionPlan)
        ? parsed.actionPlan.map((item: any, index: number) => ({
            contactId: item.contactId || '',
            contactName: item.contactName || '',
            order: item.order || index + 1,
            level: item.level === 2 ? 2 : 1,
            approach: item.approach || '',
            whatToAsk: item.whatToAsk || '',
            unlocks: Array.isArray(item.unlocks) ? item.unlocks : [],
          }))
        : [];

      const gaps: LoopGap[] = Array.isArray(parsed.gaps)
        ? parsed.gaps.map((gap: any) => ({
            need: gap.need || '',
            description: gap.description || '',
          }))
        : [];

      return {
        goal: parsed.goal || goal,
        decomposedNeeds,
        actionPlan,
        gaps,
      };
    } catch (error) {
      this.logger.error(`Erro ao fazer parse da resposta do Loop: ${error}`);
      throw new Error('Erro ao processar resposta da IA. Tente novamente.');
    }
  }
}
