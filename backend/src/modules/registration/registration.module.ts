import { Module, forwardRef } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [forwardRef(() => WhatsappModule), SettingsModule],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
