import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(private readonly openaiService: OpenAIService) {}

  /**
   * Transcreve áudio a partir de uma URL (método legado)
   */
  async transcribeAudio(audioUrl: string): Promise<string> {
    this.logger.log(`Transcrevendo áudio de URL: ${audioUrl}`);

    // Download do áudio
    const audioBuffer = await this.downloadAudio(audioUrl);

    return this.transcribeFromBuffer(audioBuffer);
  }

  /**
   * Transcreve áudio a partir de um Buffer (preferido)
   */
  async transcribeFromBuffer(audioBuffer: Buffer): Promise<string> {
    this.logger.log(`Transcrevendo áudio de buffer: ${audioBuffer.length} bytes`);

    const client = await this.openaiService.getClient();

    // Salvar temporariamente (OpenAI SDK precisa de um arquivo)
    // Usa .ogg que é o formato padrão do WhatsApp
    const tempPath = path.join(os.tmpdir(), `audio_${Date.now()}.ogg`);
    fs.writeFileSync(tempPath, audioBuffer);

    try {
      const transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        language: 'pt',
        response_format: 'text',
      });

      this.logger.log(`Transcrição concluída: ${transcription.substring(0, 100)}...`);

      return transcription;
    } finally {
      // Limpar arquivo temporário
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }

  private async downloadAudio(url: string): Promise<Buffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Erro ao baixar áudio: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
