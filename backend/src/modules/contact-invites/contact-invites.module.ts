import { Module, forwardRef } from '@nestjs/common';
import { ContactInvitesService } from './contact-invites.service';
import { SettingsModule } from '../settings/settings.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [SettingsModule, forwardRef(() => WhatsappModule)],
  providers: [ContactInvitesService],
  exports: [ContactInvitesService],
})
export class ContactInvitesModule {}
