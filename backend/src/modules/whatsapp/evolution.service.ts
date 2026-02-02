import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);

  constructor(private readonly settingsService: SettingsService) {}

  async sendTextMessage(toPhone: string, message: string): Promise<boolean> {
    try {
      const apiUrl = await this.settingsService.getDecryptedValue('evolution_api_url');
      const apiKey = await this.settingsService.getDecryptedValue('evolution_api_key');
      const instanceName = await this.settingsService.getDecryptedValue('evolution_instance_name');

      if (!apiUrl || !apiKey || !instanceName) {
        this.logger.warn('Evolution API não configurada completamente');
        return false;
      }

      // Formata o número para o formato do WhatsApp
      const formattedNumber = this.formatPhoneNumber(toPhone);

      const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          text: message,
        }),
      });

      if (response.ok) {
        this.logger.log(`Mensagem enviada para ${formattedNumber}`);
        return true;
      }

      const error = await response.text();
      this.logger.error(`Erro ao enviar mensagem: ${response.status} - ${error}`);
      return false;
    } catch (error) {
      this.logger.error('Erro ao enviar mensagem:', error);
      return false;
    }
  }

  private formatPhoneNumber(phone: string): string {
    // Remove caracteres não numéricos
    let cleaned = phone.replace(/\D/g, '');

    // Se não começar com código do país, assume Brasil (55)
    if (!cleaned.startsWith('55') && cleaned.length <= 11) {
      cleaned = '55' + cleaned;
    }

    return cleaned;
  }
}
