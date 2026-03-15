import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import * as fs from 'fs';
import * as path from 'path';
import {
  IMessagingProvider,
  ContactPayload,
  MediaType,
  MessageKeyPayload,
} from './messaging-provider.interface';

/**
 * Evolution API Provider - Fallback WhatsApp Provider
 * Uses Evolution API for WhatsApp messaging when Meta Cloud API is unavailable
 *
 * Required settings:
 * - evolution_api_url: Base URL for Evolution API
 * - evolution_api_key: API key for authentication
 * - evolution_instance_name: Instance name for the WhatsApp connection
 */
@Injectable()
export class EvolutionProvider implements IMessagingProvider {
  private readonly logger = new Logger(EvolutionProvider.name);

  readonly providerName = 'evolution';

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Get Evolution API credentials from settings
   */
  private async getCredentials() {
    const apiUrl = await this.settingsService.getDecryptedValue('evolution_api_url');
    const apiKey = await this.settingsService.getDecryptedValue('evolution_api_key');
    const instanceName = await this.settingsService.getDecryptedValue('evolution_instance_name');
    return { apiUrl, apiKey, instanceName };
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Format phone number for Evolution API
   */
  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');

    // Add Brazil country code if missing
    if (!cleaned.startsWith('55') && cleaned.length <= 11) {
      cleaned = '55' + cleaned;
    }

    return cleaned;
  }

  /**
   * Send a text message via Evolution API
   */
  async sendTextMessage(toPhone: string, message: string): Promise<boolean> {
    try {
      const { apiUrl, apiKey, instanceName } = await this.getCredentials();

      if (!apiUrl || !apiKey || !instanceName) {
        this.logger.warn('[Evolution] API not fully configured');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);

      const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          text: message,
        }),
      });

      if (response.ok) {
        this.logger.log(`[Evolution] Message sent to ${formattedNumber}`);
        return true;
      }

      const error = await response.text();
      this.logger.error(`[Evolution] Error sending message: ${response.status} - ${error}`);
      return false;
    } catch (error) {
      this.logger.error('[Evolution] Error sending message:', error);
      return false;
    }
  }

  /**
   * Send an audio message via Evolution API
   */
  async sendAudioMessage(toPhone: string, audioPath: string): Promise<boolean> {
    try {
      const { apiUrl, apiKey, instanceName } = await this.getCredentials();

      if (!apiUrl || !apiKey || !instanceName) {
        this.logger.warn('[Evolution] API not fully configured');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);

      let audioData: string;

      if (audioPath.startsWith('http')) {
        // External URL - send directly
        audioData = audioPath;
      } else {
        // Local file - convert to base64
        const absolutePath = path.resolve(audioPath);
        if (!fs.existsSync(absolutePath)) {
          this.logger.error(`[Evolution] Audio file not found: ${absolutePath}`);
          return false;
        }
        const fileBuffer = fs.readFileSync(absolutePath);
        const base64 = fileBuffer.toString('base64');
        const mimeType = this.getMimeType(absolutePath);
        audioData = `data:${mimeType};base64,${base64}`;
      }

      const response = await fetch(`${apiUrl}/message/sendWhatsAppAudio/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          audio: audioData,
        }),
      });

      if (response.ok) {
        this.logger.log(`[Evolution] Audio sent to ${formattedNumber}`);
        return true;
      }

      const error = await response.text();
      this.logger.error(`[Evolution] Error sending audio: ${response.status} - ${error}`);
      return false;
    } catch (error) {
      this.logger.error('[Evolution] Error sending audio:', error);
      return false;
    }
  }

  /**
   * Send a video message via Evolution API
   */
  async sendVideoMessage(
    toPhone: string,
    videoPath: string,
    caption?: string,
  ): Promise<boolean> {
    try {
      const { apiUrl, apiKey, instanceName } = await this.getCredentials();

      if (!apiUrl || !apiKey || !instanceName) {
        this.logger.warn('[Evolution] API not fully configured');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);

      let videoData: string;

      if (videoPath.startsWith('http')) {
        // External URL - send directly
        videoData = videoPath;
      } else {
        // Local file - convert to base64
        const absolutePath = path.resolve(videoPath);
        if (!fs.existsSync(absolutePath)) {
          this.logger.error(`[Evolution] Video file not found: ${absolutePath}`);
          return false;
        }
        const fileBuffer = fs.readFileSync(absolutePath);
        const base64 = fileBuffer.toString('base64');
        const mimeType = this.getMimeType(absolutePath);
        videoData = `data:${mimeType};base64,${base64}`;
      }

      const response = await fetch(`${apiUrl}/message/sendMedia/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          mediatype: 'video',
          media: videoData,
          caption: caption || '',
        }),
      });

      if (response.ok) {
        this.logger.log(`[Evolution] Video sent to ${formattedNumber}`);
        return true;
      }

      const error = await response.text();
      this.logger.error(`[Evolution] Error sending video: ${response.status} - ${error}`);
      return false;
    } catch (error) {
      this.logger.error('[Evolution] Error sending video:', error);
      return false;
    }
  }

  /**
   * Send a contact card via Evolution API
   */
  async sendContact(toPhone: string, contact: ContactPayload): Promise<boolean> {
    try {
      const { apiUrl, apiKey, instanceName } = await this.getCredentials();

      if (!apiUrl || !apiKey || !instanceName) {
        this.logger.warn('[Evolution] API not fully configured');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);
      const contactPhone = this.formatPhoneNumber(contact.phoneNumber);

      const response = await fetch(`${apiUrl}/message/sendContact/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          contact: [
            {
              fullName: contact.fullName,
              wuid: `${contactPhone}@s.whatsapp.net`,
              phoneNumber: contactPhone,
              organization: contact.organization || '',
            },
          ],
        }),
      });

      if (response.ok) {
        this.logger.log(`[Evolution] Contact ${contact.fullName} sent to ${formattedNumber}`);
        return true;
      }

      const error = await response.text();
      this.logger.error(`[Evolution] Error sending contact: ${response.status} - ${error}`);
      return false;
    } catch (error) {
      this.logger.error('[Evolution] Error sending contact:', error);
      return false;
    }
  }

  /**
   * Download media via Evolution API
   * Uses getBase64FromMediaMessage endpoint to get decrypted media
   */
  async downloadMedia(
    messageKey: MessageKeyPayload,
    type: MediaType,
  ): Promise<Buffer | null> {
    try {
      const { apiUrl, apiKey, instanceName } = await this.getCredentials();

      if (!apiUrl || !apiKey || !instanceName) {
        this.logger.warn('[Evolution] API not fully configured');
        return null;
      }

      this.logger.log(`[Evolution] Downloading media type ${type}`);

      const response = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          message: {
            key: messageKey,
          },
          convertToMp4: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`[Evolution] Error downloading media: ${response.status} - ${error}`);
        return null;
      }

      const data = await response.json();

      this.logger.log(
        `[Evolution] Download response: ${JSON.stringify(data).substring(0, 200)}`,
      );

      // Evolution may return base64 directly or inside an object
      const base64Content = data.base64 || data.data?.base64 || data.mediaMessage?.base64;

      if (base64Content) {
        // Remove data:audio/ogg;base64, prefix if present
        const base64Data = base64Content.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        this.logger.log(`[Evolution] Media downloaded successfully: ${buffer.length} bytes`);
        return buffer;
      }

      this.logger.error(
        `[Evolution] Response does not contain base64. Keys: ${Object.keys(data).join(', ')}`,
      );
      return null;
    } catch (error) {
      this.logger.error('[Evolution] Error downloading media:', error);
      return null;
    }
  }
}
