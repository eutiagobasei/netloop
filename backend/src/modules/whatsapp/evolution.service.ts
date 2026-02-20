import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Busca credenciais da Evolution API
   */
  private async getCredentials() {
    const apiUrl = await this.settingsService.getDecryptedValue('evolution_api_url');
    const apiKey = await this.settingsService.getDecryptedValue('evolution_api_key');
    const instanceName = await this.settingsService.getDecryptedValue('evolution_instance_name');
    return { apiUrl, apiKey, instanceName };
  }

  /**
   * Retorna o MIME type baseado na extensão do arquivo
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

  /**
   * Envia mensagem de áudio
   */
  async sendAudioMessage(toPhone: string, audioPath: string): Promise<boolean> {
    try {
      const { apiUrl, apiKey, instanceName } = await this.getCredentials();
      if (!apiUrl || !apiKey || !instanceName) {
        this.logger.warn('Evolution API não configurada completamente');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);

      let audioData: string;

      if (audioPath.startsWith('http')) {
        // URL externa - envia diretamente
        audioData = audioPath;
      } else {
        // Arquivo local - converte para base64
        const absolutePath = path.resolve(audioPath);
        if (!fs.existsSync(absolutePath)) {
          this.logger.error(`Arquivo de áudio não encontrado: ${absolutePath}`);
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
        this.logger.log(`Áudio enviado para ${formattedNumber}`);
        return true;
      }

      const error = await response.text();
      this.logger.error(`Erro ao enviar áudio: ${response.status} - ${error}`);
      return false;
    } catch (error) {
      this.logger.error('Erro ao enviar áudio:', error);
      return false;
    }
  }

  /**
   * Baixa mídia (áudio/imagem/vídeo) usando a Evolution API
   * Retorna o buffer do arquivo descriptografado
   */
  async downloadMedia(messageKey: any, messageType: 'audio' | 'image' | 'video' | 'document' = 'audio'): Promise<Buffer | null> {
    try {
      const { apiUrl, apiKey, instanceName } = await this.getCredentials();
      if (!apiUrl || !apiKey || !instanceName) {
        this.logger.warn('Evolution API não configurada completamente');
        return null;
      }

      this.logger.log(`Baixando mídia tipo ${messageType} via Evolution API`);

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
        this.logger.error(`Erro ao baixar mídia: ${response.status} - ${error}`);
        return null;
      }

      const data = await response.json();

      this.logger.log(`Resposta Evolution downloadMedia: ${JSON.stringify(data).substring(0, 200)}`);

      // A Evolution pode retornar base64 diretamente ou dentro de um objeto
      const base64Content = data.base64 || data.data?.base64 || data.mediaMessage?.base64;

      if (base64Content) {
        // Remove prefixo data:audio/ogg;base64, se existir
        const base64Data = base64Content.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        this.logger.log(`Mídia baixada com sucesso: ${buffer.length} bytes`);
        return buffer;
      }

      this.logger.error(`Resposta da Evolution não contém base64. Keys: ${Object.keys(data).join(', ')}`);
      return null;
    } catch (error) {
      this.logger.error('Erro ao baixar mídia:', error);
      return null;
    }
  }

  /**
   * Envia mensagem de vídeo
   */
  async sendVideoMessage(
    toPhone: string,
    videoPath: string,
    caption?: string,
  ): Promise<boolean> {
    try {
      const { apiUrl, apiKey, instanceName } = await this.getCredentials();
      if (!apiUrl || !apiKey || !instanceName) {
        this.logger.warn('Evolution API não configurada completamente');
        return false;
      }

      const formattedNumber = this.formatPhoneNumber(toPhone);

      let videoData: string;

      if (videoPath.startsWith('http')) {
        // URL externa - envia diretamente
        videoData = videoPath;
      } else {
        // Arquivo local - converte para base64
        const absolutePath = path.resolve(videoPath);
        if (!fs.existsSync(absolutePath)) {
          this.logger.error(`Arquivo de vídeo não encontrado: ${absolutePath}`);
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
        this.logger.log(`Vídeo enviado para ${formattedNumber}`);
        return true;
      }

      const error = await response.text();
      this.logger.error(`Erro ao enviar vídeo: ${response.status} - ${error}`);
      return false;
    } catch (error) {
      this.logger.error('Erro ao enviar vídeo:', error);
      return false;
    }
  }
}
