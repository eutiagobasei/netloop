import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(private readonly openaiService: OpenAIService) {}

  async transcribeAudio(audioUrl: string): Promise<string> {
    this.logger.log(`Transcrevendo áudio: ${audioUrl}`);

    const client = await this.openaiService.getClient();

    // Download do áudio
    const audioBuffer = await this.downloadAudio(audioUrl);

    // Salvar temporariamente (OpenAI SDK precisa de um arquivo)
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
