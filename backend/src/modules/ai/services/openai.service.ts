import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SettingsService } from '@/modules/settings/settings.service';

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private client: OpenAI | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  async getClient(): Promise<OpenAI> {
    const apiKey = await this.settingsService.getDecryptedValue('openai_api_key');

    if (!apiKey) {
      throw new Error('OpenAI API key não configurada. Configure em Configurações > API Keys');
    }

    // Recria o client se a API key mudar
    if (!this.client) {
      this.client = new OpenAI({ apiKey });
    }

    return this.client;
  }

  async isConfigured(): Promise<boolean> {
    try {
      const apiKey = await this.settingsService.getDecryptedValue('openai_api_key');
      return !!apiKey;
    } catch {
      return false;
    }
  }

  // Limpa o client para forçar recriação (útil quando API key é atualizada)
  clearClient(): void {
    this.client = null;
  }
}
