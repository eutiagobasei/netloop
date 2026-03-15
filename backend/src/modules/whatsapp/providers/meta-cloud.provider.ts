import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import {
  IMessagingProvider,
  ContactPayload,
  MediaType,
  MessageKeyPayload,
} from './messaging-provider.interface';

/**
 * Meta Cloud API Provider - Primary/Official WhatsApp Provider
 * Uses the official Meta WhatsApp Business Cloud API
 *
 * Required settings:
 * - meta_phone_number_id: Phone number ID from Meta Business
 * - meta_access_token: Bearer token for authentication
 * - meta_api_version: API version (e.g., v23.0)
 */
@Injectable()
export class MetaCloudProvider implements IMessagingProvider {
  private readonly logger = new Logger(MetaCloudProvider.name);

  readonly providerName = 'meta-cloud';

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Get Meta API credentials from settings
   */
  private async getCredentials() {
    const phoneNumberId = await this.settingsService.getDecryptedValue('meta_phone_number_id');
    const accessToken = await this.settingsService.getDecryptedValue('meta_access_token');
    const apiVersion =
      (await this.settingsService.getDecryptedValue('meta_api_version')) || 'v23.0';

    return { phoneNumberId, accessToken, apiVersion };
  }

  /**
   * Format phone number for Meta API (international format without +)
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
   * Send a text message via Meta Cloud API
   */
  async sendTextMessage(toPhone: string, message: string): Promise<boolean> {
    try {
      const { phoneNumberId, accessToken, apiVersion } = await this.getCredentials();

      if (!phoneNumberId || !accessToken) {
        this.logger.warn('Meta Cloud API not fully configured');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);

      const response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: formattedNumber,
            type: 'text',
            text: { body: message },
          }),
        },
      );

      if (response.ok) {
        this.logger.log(`[Meta] Message sent to ${formattedNumber}`);
        return true;
      }

      const error = await response.text();
      this.logger.error(`[Meta] Error sending message: ${response.status} - ${error}`);
      return false;
    } catch (error) {
      this.logger.error('[Meta] Error sending message:', error);
      return false;
    }
  }

  /**
   * Send an audio message via Meta Cloud API
   */
  async sendAudioMessage(toPhone: string, audioPath: string): Promise<boolean> {
    try {
      const { phoneNumberId, accessToken, apiVersion } = await this.getCredentials();

      if (!phoneNumberId || !accessToken) {
        this.logger.warn('Meta Cloud API not fully configured');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);

      // For Meta API, we need to upload the media first or use a URL
      // If it's a URL, we can send it directly
      if (audioPath.startsWith('http')) {
        const response = await fetch(
          `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: formattedNumber,
              type: 'audio',
              audio: { link: audioPath },
            }),
          },
        );

        if (response.ok) {
          this.logger.log(`[Meta] Audio sent to ${formattedNumber}`);
          return true;
        }

        const error = await response.text();
        this.logger.error(`[Meta] Error sending audio: ${response.status} - ${error}`);
        return false;
      }

      // For local files, we need to upload first
      this.logger.warn('[Meta] Local audio file upload not yet implemented');
      return false;
    } catch (error) {
      this.logger.error('[Meta] Error sending audio:', error);
      return false;
    }
  }

  /**
   * Send a video message via Meta Cloud API
   */
  async sendVideoMessage(
    toPhone: string,
    videoPath: string,
    caption?: string,
  ): Promise<boolean> {
    try {
      const { phoneNumberId, accessToken, apiVersion } = await this.getCredentials();

      if (!phoneNumberId || !accessToken) {
        this.logger.warn('Meta Cloud API not fully configured');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);

      if (videoPath.startsWith('http')) {
        const videoPayload: any = { link: videoPath };
        if (caption) {
          videoPayload.caption = caption;
        }

        const response = await fetch(
          `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: formattedNumber,
              type: 'video',
              video: videoPayload,
            }),
          },
        );

        if (response.ok) {
          this.logger.log(`[Meta] Video sent to ${formattedNumber}`);
          return true;
        }

        const error = await response.text();
        this.logger.error(`[Meta] Error sending video: ${response.status} - ${error}`);
        return false;
      }

      this.logger.warn('[Meta] Local video file upload not yet implemented');
      return false;
    } catch (error) {
      this.logger.error('[Meta] Error sending video:', error);
      return false;
    }
  }

  /**
   * Send a contact card via Meta Cloud API
   */
  async sendContact(toPhone: string, contact: ContactPayload): Promise<boolean> {
    try {
      const { phoneNumberId, accessToken, apiVersion } = await this.getCredentials();

      if (!phoneNumberId || !accessToken) {
        this.logger.warn('Meta Cloud API not fully configured');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);
      const contactPhone = this.formatPhoneNumber(contact.phoneNumber);

      // Split name into first and last name
      const nameParts = contact.fullName.split(' ');
      const firstName = nameParts[0] || contact.fullName;
      const lastName = nameParts.slice(1).join(' ') || '';

      const contactPayload: any = {
        name: {
          formatted_name: contact.fullName,
          first_name: firstName,
        },
        phones: [
          {
            phone: contactPhone,
            type: 'CELL',
          },
        ],
      };

      if (lastName) {
        contactPayload.name.last_name = lastName;
      }

      if (contact.organization) {
        contactPayload.org = {
          company: contact.organization,
        };
      }

      const response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: formattedNumber,
            type: 'contacts',
            contacts: [contactPayload],
          }),
        },
      );

      if (response.ok) {
        this.logger.log(`[Meta] Contact ${contact.fullName} sent to ${formattedNumber}`);
        return true;
      }

      const error = await response.text();
      this.logger.error(`[Meta] Error sending contact: ${response.status} - ${error}`);
      return false;
    } catch (error) {
      this.logger.error('[Meta] Error sending contact:', error);
      return false;
    }
  }

  /**
   * Download media from Meta Cloud API
   * Meta requires two API calls:
   * 1. GET the media URL from mediaId
   * 2. GET the actual file from the URL
   */
  async downloadMedia(
    messageKey: MessageKeyPayload,
    type: MediaType,
  ): Promise<Buffer | null> {
    try {
      const { accessToken, apiVersion } = await this.getCredentials();

      if (!accessToken) {
        this.logger.warn('Meta Cloud API not fully configured');
        return null;
      }

      const mediaId = messageKey.mediaId;
      if (!mediaId) {
        this.logger.error('[Meta] No mediaId provided for download');
        return null;
      }

      this.logger.log(`[Meta] Downloading media ${mediaId} (type: ${type})`);

      // Step 1: Get media URL
      const mediaResponse = await fetch(
        `https://graph.facebook.com/${apiVersion}/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!mediaResponse.ok) {
        const error = await mediaResponse.text();
        this.logger.error(`[Meta] Error getting media URL: ${mediaResponse.status} - ${error}`);
        return null;
      }

      const mediaData = await mediaResponse.json();
      const mediaUrl = mediaData.url;

      if (!mediaUrl) {
        this.logger.error('[Meta] No URL in media response');
        return null;
      }

      // Step 2: Download the actual file
      const fileResponse = await fetch(mediaUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!fileResponse.ok) {
        this.logger.error(`[Meta] Error downloading file: ${fileResponse.status}`);
        return null;
      }

      const buffer = Buffer.from(await fileResponse.arrayBuffer());
      this.logger.log(`[Meta] Media downloaded successfully: ${buffer.length} bytes`);

      return buffer;
    } catch (error) {
      this.logger.error('[Meta] Error downloading media:', error);
      return null;
    }
  }
}
