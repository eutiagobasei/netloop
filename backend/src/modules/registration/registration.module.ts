import { Module, forwardRef } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { SettingsModule } from '../settings/settings.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [forwardRef(() => WhatsappModule), SettingsModule, AIModule],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
