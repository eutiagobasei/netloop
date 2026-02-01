import { Module, forwardRef } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { OpenAIService } from './services/openai.service';
import { TranscriptionService } from './services/transcription.service';
import { ExtractionService } from './services/extraction.service';
import { EmbeddingService } from './services/embedding.service';
import { SettingsModule } from '../settings/settings.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [
    SettingsModule,
    forwardRef(() => ContactsModule),
  ],
  controllers: [AIController],
  providers: [
    AIService,
    OpenAIService,
    TranscriptionService,
    ExtractionService,
    EmbeddingService,
  ],
  exports: [AIService],
})
export class AIModule {}
