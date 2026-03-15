import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ContactsService } from '../contacts/contacts.service';
import { MemoryRequestResult, MemorySummary } from './dto/memory-request.dto';
import { DEFAULT_PROMPTS } from '../ai/constants/default-prompts';
import { OpenAIService } from '../ai/services/openai.service';
import { SettingsService } from '../settings/settings.service';

// Campos editáveis pelo usuário
const USER_EDITABLE_FIELDS = ['name', 'email'] as const;
type UserEditableField = (typeof USER_EDITABLE_FIELDS)[number];

// Mapeamento de nomes amigáveis para campos
const FIELD_NAMES: Record<string, string> = {
  name: 'nome',
  email: 'email',
  company: 'empresa',
  position: 'cargo',
  context: 'contexto',
  notes: 'notas',
  phone: 'telefone',
};

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => ContactsService))
    private readonly contactsService: ContactsService,
    private readonly openaiService: OpenAIService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Obtém um prompt do banco de dados ou retorna o padrão
   */
  private async getPrompt(key: keyof typeof DEFAULT_PROMPTS): Promise<string> {
    try {
      const setting = await this.settingsService.getDecryptedValue(`prompt_${key}`);
      return setting || DEFAULT_PROMPTS[key];
    } catch {
      return DEFAULT_PROMPTS[key];
    }
  }

  /**
   * Processa pedido de memória via IA
   * Identifica se é edição de próprios dados, edição de contato, ou consulta
   */
  async processMemoryRequest(
    userId: string,
    message: string,
  ): Promise<{ response: string; action: string }> {
    this.logger.log(`[Memory] Processando pedido: "${message.substring(0, 50)}..."`);

    // Busca dados do usuário para contexto
    const user = await this.usersService.findById(userId);

    // Usa IA para classificar a intenção
    const classification = await this.classifyMemoryIntent(message, user.name, user.email);

    this.logger.log(`[Memory] Classificação: ${JSON.stringify(classification)}`);

    // Processa baseado na intenção
    switch (classification.intent) {
      case 'edit_self':
        return this.handleEditSelf(userId, classification);

      case 'edit_contact':
        return this.handleEditContact(userId, classification);

      case 'query_self':
        return this.handleQuerySelf(userId);

      case 'query_contact':
        return this.handleQueryContact(userId, classification);

      default:
        return {
          response: 'Desculpa, não entendi o que você quer fazer. Pode reformular?',
          action: 'unknown',
        };
    }
  }

  /**
   * Classifica a intenção de memória usando IA
   */
  private async classifyMemoryIntent(
    message: string,
    userName: string,
    userEmail: string,
  ): Promise<MemoryRequestResult> {
    const client = await this.openaiService.getClient();

    let systemPrompt = await this.getPrompt('memory_management');

    // Substitui placeholders
    systemPrompt = systemPrompt
      .replace(/\{\{message\}\}/g, message)
      .replace(/\{\{userName\}\}/g, userName)
      .replace(/\{\{userEmail\}\}/g, userEmail)
      .replace(/\{\{lastInteraction\}\}/g, 'agora');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Resposta vazia do modelo');
      }

      return JSON.parse(content) as MemoryRequestResult;
    } catch (error) {
      this.logger.error(`[Memory] Erro na classificação: ${error.message}`);
      return {
        intent: 'other',
        target: { type: 'user', identifier: null, field: null },
        newValue: null,
        confidence: 0,
        needsClarification: true,
        clarificationQuestion: 'Desculpa, não entendi. O que você gostaria de fazer?',
      };
    }
  }

  /**
   * Edita dados do próprio usuário
   */
  private async handleEditSelf(
    userId: string,
    classification: MemoryRequestResult,
  ): Promise<{ response: string; action: string }> {
    const { field } = classification.target;
    const newValue = classification.newValue;

    // Validação
    if (!field || !newValue) {
      return {
        response: 'Qual informação você quer atualizar e para qual valor?',
        action: 'clarification_needed',
      };
    }

    // Verifica se campo é editável
    if (!USER_EDITABLE_FIELDS.includes(field as UserEditableField)) {
      return {
        response: `Desculpa, não consigo editar o campo "${FIELD_NAMES[field] || field}".`,
        action: 'invalid_field',
      };
    }

    try {
      // Atualiza usuário
      await this.usersService.update(userId, { [field]: newValue });

      const fieldName = FIELD_NAMES[field] || field;
      return {
        response: `Pronto! Seu ${fieldName} foi atualizado para "${newValue}" 👍`,
        action: 'user_updated',
      };
    } catch (error) {
      this.logger.error(`[Memory] Erro ao atualizar usuário: ${error.message}`);
      return {
        response: `Erro ao atualizar ${FIELD_NAMES[field] || field}. Tente novamente.`,
        action: 'error',
      };
    }
  }

  /**
   * Edita dados de um contato
   */
  private async handleEditContact(
    userId: string,
    classification: MemoryRequestResult,
  ): Promise<{ response: string; action: string }> {
    const { identifier, field } = classification.target;
    const { newValue } = classification;

    // Validação
    if (!identifier) {
      return {
        response: 'Qual contato você quer editar?',
        action: 'clarification_needed',
      };
    }

    // Busca contato por nome fuzzy
    const contact = await this.contactsService.searchByNameNormalized(userId, identifier);

    if (!contact) {
      return {
        response: `Não encontrei "${identifier}" nos seus contatos. Qual é o nome completo?`,
        action: 'contact_not_found',
      };
    }

    // Se não tem valor ou campo, provavelmente é adição de contexto
    const targetField = field || 'context';
    const targetValue = newValue || classification.newValue;

    if (!targetValue) {
      return {
        response: `O que você quer adicionar/atualizar sobre ${contact.name}?`,
        action: 'clarification_needed',
      };
    }

    try {
      // Se é contexto, acumula ao invés de substituir
      if (targetField === 'context') {
        const existingContext = contact.context || '';
        const updatedContext = existingContext
          ? `${existingContext}\n\n${targetValue}`
          : targetValue;

        await this.contactsService.update(contact.id, userId, { context: updatedContext });
      } else {
        await this.contactsService.update(contact.id, userId, { [targetField]: targetValue });
      }

      const fieldName = FIELD_NAMES[targetField] || targetField;
      const action = targetField === 'context' ? 'adicionado ao' : 'atualizado em';

      return {
        response: `Pronto! ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} ${action} *${contact.name}* 👍`,
        action: 'contact_updated',
      };
    } catch (error) {
      this.logger.error(`[Memory] Erro ao atualizar contato: ${error.message}`);
      return {
        response: `Erro ao atualizar ${contact.name}. Tente novamente.`,
        action: 'error',
      };
    }
  }

  /**
   * Consulta dados do próprio usuário
   */
  private async handleQuerySelf(userId: string): Promise<{ response: string; action: string }> {
    try {
      const summary = await this.getUserMemorySummary(userId);

      let response = `Seu perfil:\n\n`;
      response += `*Nome:* ${summary.user.name}\n`;
      response += `*Email:* ${summary.user.email}\n`;
      if (summary.user.phone) {
        response += `*Telefone:* ${summary.user.phone}\n`;
      }
      response += `\n*Contatos salvos:* ${summary.user.contactsCount}\n`;

      if (summary.user.topTags.length > 0) {
        response += `*Tags mais usadas:* ${summary.user.topTags.join(', ')}\n`;
      }

      if (summary.recentContacts.length > 0) {
        response += `\n*Últimos contatos:*\n`;
        for (const contact of summary.recentContacts) {
          response += `• ${contact.name}`;
          if (contact.context) {
            response += ` - _${contact.context.substring(0, 30)}..._`;
          }
          response += '\n';
        }
      }

      return { response, action: 'query_self' };
    } catch (error) {
      this.logger.error(`[Memory] Erro ao consultar usuário: ${error.message}`);
      return {
        response: 'Erro ao buscar seus dados. Tente novamente.',
        action: 'error',
      };
    }
  }

  /**
   * Consulta dados de um contato específico
   */
  private async handleQueryContact(
    userId: string,
    classification: MemoryRequestResult,
  ): Promise<{ response: string; action: string }> {
    const { identifier } = classification.target;

    if (!identifier) {
      return {
        response: 'Sobre qual contato você quer saber?',
        action: 'clarification_needed',
      };
    }

    const contact = await this.contactsService.searchByNameNormalized(userId, identifier);

    if (!contact) {
      return {
        response: `Não encontrei "${identifier}" nos seus contatos.`,
        action: 'contact_not_found',
      };
    }

    let response = `*${contact.name}*\n\n`;

    if (contact.position) response += `Cargo: ${contact.position}\n`;
    if (contact.company) response += `Empresa: ${contact.company}\n`;
    if (contact.phone) response += `Telefone: ${contact.phone}\n`;
    if (contact.email) response += `Email: ${contact.email}\n`;
    if (contact.location) response += `Local: ${contact.location}\n`;

    if (contact.context) {
      response += `\n*Contexto:*\n_${contact.context}_\n`;
    }

    if (contact.notes) {
      response += `\n*Notas:*\n_${contact.notes}_\n`;
    }

    // Busca tags
    const fullContact = await this.prisma.contact.findUnique({
      where: { id: contact.id },
      include: { tags: { include: { tag: true } } },
    });

    if (fullContact?.tags && fullContact.tags.length > 0) {
      const tagNames = fullContact.tags.map((t) => t.tag.name);
      response += `\n*Tags:* ${tagNames.join(', ')}\n`;
    }

    return { response, action: 'query_contact' };
  }

  /**
   * Retorna resumo da memória do usuário
   */
  async getUserMemorySummary(userId: string): Promise<MemorySummary> {
    const user = await this.usersService.findById(userId);

    // Conta contatos
    const contactsCount = await this.prisma.contact.count({
      where: { ownerId: userId },
    });

    // Busca tags mais usadas
    const topTags = await this.prisma.contactTag.groupBy({
      by: ['tagId'],
      where: {
        contact: { ownerId: userId },
      },
      _count: { tagId: true },
      orderBy: { _count: { tagId: 'desc' } },
      take: 5,
    });

    const tagIds = topTags.map((t) => t.tagId);
    const tags = await this.prisma.tag.findMany({
      where: { id: { in: tagIds } },
      select: { name: true },
    });

    // Busca últimos contatos
    const recentContacts = await this.prisma.contact.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { name: true, context: true },
    });

    return {
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        contactsCount,
        topTags: tags.map((t) => t.name),
      },
      recentContacts: recentContacts.map((c) => ({
        name: c.name,
        context: c.context,
      })),
    };
  }

  /**
   * Verifica se a mensagem parece ser sobre memória/edição
   */
  isMemoryRelatedMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Padrões de edição de próprios dados
    const selfEditPatterns = [
      /^meu\s+(nome|email)\s+(é|e|mudou|agora)/i,
      /corrig(e|a)\s+meu\s+(nome|email)/i,
      /atualiz(a|e)\s+meu\s+(nome|email)/i,
      /mudei\s+(de\s+)?(nome|email)/i,
    ];

    // Padrões de consulta
    const queryPatterns = [
      /o\s+que\s+voc[êe]\s+sabe\s+sobre\s+mim/i,
      /quais\s+(são\s+)?meus\s+dados/i,
      /meu\s+perfil/i,
      /o\s+que\s+eu\s+tenho\s+cadastrado/i,
      /o\s+que\s+(eu\s+)?sei\s+(d|sobre)\s*/i,
    ];

    // Padrões de edição de contato
    const contactEditPatterns = [
      /adiciona\s+(no|na|em|que)\s+/i,
      /o\s+\w+\s+agora\s+[ée]/i,
      /atualiz(a|e)\s+(no|na|o|a)\s+/i,
    ];

    const allPatterns = [...selfEditPatterns, ...queryPatterns, ...contactEditPatterns];

    return allPatterns.some((pattern) => pattern.test(lowerMessage));
  }
}
