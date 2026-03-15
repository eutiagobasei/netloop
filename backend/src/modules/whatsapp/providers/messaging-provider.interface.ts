/**
 * Interface for WhatsApp messaging providers
 * Supports both Meta Cloud API (primary) and Evolution API (fallback)
 */
export interface IMessagingProvider {
  /**
   * Provider identifier for logging and debugging
   */
  readonly providerName: string;

  /**
   * Send a text message to a phone number
   */
  sendTextMessage(toPhone: string, message: string): Promise<boolean>;

  /**
   * Send an audio message to a phone number
   * @param audioPath - URL or local file path to audio
   */
  sendAudioMessage(toPhone: string, audioPath: string): Promise<boolean>;

  /**
   * Send a video message to a phone number
   * @param videoPath - URL or local file path to video
   * @param caption - Optional caption for the video
   */
  sendVideoMessage(toPhone: string, videoPath: string, caption?: string): Promise<boolean>;

  /**
   * Send a contact card (vCard) to a phone number
   */
  sendContact(toPhone: string, contact: ContactPayload): Promise<boolean>;

  /**
   * Download media from a message
   * For Evolution: uses messageKey to download via getBase64FromMediaMessage
   * For Meta: uses mediaId to download via Graph API
   */
  downloadMedia(messageKey: MessageKeyPayload, type: MediaType): Promise<Buffer | null>;
}

export type MediaType = 'audio' | 'image' | 'video' | 'document';

export interface ContactPayload {
  fullName: string;
  phoneNumber: string;
  organization?: string;
}

/**
 * Message key structure - varies by provider
 * Evolution: { id, remoteJid, fromMe, participant? }
 * Meta: { mediaId }
 */
export interface MessageKeyPayload {
  // Evolution API format
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
  participant?: string;

  // Meta API format
  mediaId?: string;
}
