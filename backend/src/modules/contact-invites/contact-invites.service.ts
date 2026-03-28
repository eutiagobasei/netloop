import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MessagingProviderFactory } from '../whatsapp/providers';

const DEFAULT_INVITE_MESSAGE = `🤝 *{inviterName}* acabou de adicionar você à rede de networking dele no Netloop!

O Netloop é uma plataforma que ajuda profissionais a gerenciar suas conexões de forma inteligente.

Por enquanto o acesso é *gratuito*! Responda qualquer mensagem para começar seu cadastro.`;

@Injectable()
export class ContactInvitesService {
  private readonly logger = new Logger(ContactInvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => MessagingProviderFactory))
    private readonly messagingFactory: MessagingProviderFactory,
  ) {}

  /**
   * Processa notificação quando um contato é criado
   * Chamado após ContactsService.create()
   */
  async processContactCreated(
    inviterId: string,
    inviterName: string,
    contactPhone: string,
    contactName?: string,
  ): Promise<void> {
    try {
      // 1. Verifica se feature está habilitada
      const enabled = await this.getSettingValue('contact_invite_enabled');
      if (enabled === 'false') {
        this.logger.log('Contact invites disabled, skipping notification');
        return;
      }

      // 2. Verifica se telefone já é usuário
      const existingUser = await this.prisma.user.findFirst({
        where: { phone: contactPhone },
      });
      if (existingUser) {
        this.logger.log(`Phone ${contactPhone} is already a registered user, skipping invite`);
        return;
      }

      // 3. Verifica se já existe convite para este telefone
      const existingInvite = await this.prisma.contactInvite.findUnique({
        where: { phone: contactPhone },
      });

      if (existingInvite) {
        // Incrementa contador, não reenvia
        await this.prisma.contactInvite.update({
          where: { id: existingInvite.id },
          data: { inviteCount: { increment: 1 } },
        });
        this.logger.log(`Contact ${contactPhone} already invited, incremented count`);
        return;
      }

      // 4. Cria novo convite
      const invite = await this.prisma.contactInvite.create({
        data: {
          phone: contactPhone,
          inviterId,
          inviterName,
          contactName,
          status: 'PENDING',
        },
      });

      this.logger.log(`ContactInvite created for ${contactPhone}`);

      // 5. Envia notificação (async, não bloqueia)
      this.sendInviteNotification(invite.id).catch((err) => {
        this.logger.error(`Erro ao enviar convite: ${err.message}`);
      });
    } catch (error) {
      this.logger.error(`Error processing contact invite: ${error}`);
    }
  }

  /**
   * Envia a notificação via WhatsApp
   */
  private async sendInviteNotification(inviteId: string): Promise<void> {
    const invite = await this.prisma.contactInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite || invite.status !== 'PENDING') return;

    // Delay configurável
    const delaySetting = await this.getSettingValue('contact_invite_delay_ms');
    const delay = parseInt(delaySetting || '5000', 10);
    await new Promise((r) => setTimeout(r, delay));

    // Busca template
    const templateSetting = await this.getSettingValue('contact_invite_message');
    const template = templateSetting || DEFAULT_INVITE_MESSAGE;

    // Substitui variáveis
    const message = template
      .replace(/{inviterName}/g, invite.inviterName)
      .replace(/{contactName}/g, invite.contactName || 'você')
      .replace(/{inviteCount}/g, String(invite.inviteCount));

    // Envia via provider
    try {
      const provider = await this.messagingFactory.getProvider();
      const sent = await provider.sendTextMessage(invite.phone, message);

      if (sent) {
        await this.prisma.contactInvite.update({
          where: { id: invite.id },
          data: { status: 'NOTIFIED', notifiedAt: new Date() },
        });
        this.logger.log(`Invite notification sent to ${invite.phone}`);
      } else {
        this.logger.warn(`Failed to send invite notification to ${invite.phone}`);
      }
    } catch (error) {
      this.logger.error(`Error sending invite notification: ${error}`);
    }
  }

  /**
   * Marca convite como registrado quando usuário se cadastra
   */
  async markAsRegistered(phone: string): Promise<void> {
    const result = await this.prisma.contactInvite.updateMany({
      where: { phone, status: { in: ['PENDING', 'NOTIFIED'] } },
      data: { status: 'REGISTERED', registeredAt: new Date() },
    });

    if (result.count > 0) {
      this.logger.log(`Contact invite for ${phone} marked as REGISTERED`);
    }
  }

  /**
   * Helper para buscar valor de setting com tratamento de erro
   */
  private async getSettingValue(key: string): Promise<string | null> {
    try {
      const setting = await this.settingsService.findByKey(key);
      return setting?.value || null;
    } catch {
      // Setting não existe
      return null;
    }
  }
}
