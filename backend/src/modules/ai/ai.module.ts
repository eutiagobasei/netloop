import { Module, forwardRef } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { OpenAIService } from './services/openai.service';
import { TranscriptionService } from './services/transcription.service';
import { ExtractionService } from './services/extraction.service';
import { EmbeddingService } from './services/embedding.service';
import { EmbeddingCacheService } from './services/embedding-cache.service';
import { LoopService } from './services/loop.service';
import { SettingsModule } from '../settings/settings.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [SettingsModule, forwardRef(() => ContactsModule)],
  controllers: [AIController],
  providers: [
    AIService,
    OpenAIService,
    TranscriptionService,
    ExtractionService,
    EmbeddingService,
    EmbeddingCacheService,
    LoopService,
  ],
  exports: [
    AIService,
    OpenAIService,
    ExtractionService,
    EmbeddingService,
    EmbeddingCacheService,
    LoopService,
  ],
})
export class AIModule {}
