import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { IMessagingProvider } from './messaging-provider.interface';
import { MetaCloudProvider } from './meta-cloud.provider';
import { EvolutionProvider } from './evolution.provider';

export type WhatsAppProviderType = 'meta' | 'evolution';

/**
 * Factory for selecting the appropriate WhatsApp messaging provider
 *
 * Provider selection via SystemSettings:
 * - whatsapp_provider = 'meta' (default, primary/official)
 * - whatsapp_provider = 'evolution' (fallback for emergencies)
 */
@Injectable()
export class MessagingProviderFactory {
  private readonly logger = new Logger(MessagingProviderFactory.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly evolutionProvider: EvolutionProvider,
    private readonly metaCloudProvider: MetaCloudProvider,
  ) {}

  /**
   * Get the configured messaging provider
   * Defaults to 'meta' (Meta Cloud API) as the primary provider
   */
  async getProvider(): Promise<IMessagingProvider> {
    const providerSetting = await this.settingsService.getDecryptedValue('whatsapp_provider');
    const provider = (providerSetting as WhatsAppProviderType) || 'meta';

    this.logger.debug(`Using WhatsApp provider: ${provider}`);

    switch (provider) {
      case 'evolution':
        return this.evolutionProvider;
      case 'meta':
      default:
        return this.metaCloudProvider;
    }
  }

  /**
   * Get a specific provider by type (bypassing settings)
   * Useful for testing or forced fallback scenarios
   */
  getProviderByType(type: WhatsAppProviderType): IMessagingProvider {
    switch (type) {
      case 'evolution':
        return this.evolutionProvider;
      case 'meta':
      default:
        return this.metaCloudProvider;
    }
  }

  /**
   * Get the current provider type from settings
   */
  async getCurrentProviderType(): Promise<WhatsAppProviderType> {
    const providerSetting = await this.settingsService.getDecryptedValue('whatsapp_provider');
    return (providerSetting as WhatsAppProviderType) || 'meta';
  }
}
