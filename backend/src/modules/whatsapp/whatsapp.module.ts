import { Module, forwardRef } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { EvolutionService } from './evolution.service';
import { ContactsModule } from '../contacts/contacts.module';
import { AIModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ContactsModule, forwardRef(() => AIModule), SettingsModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, EvolutionService],
  exports: [WhatsappService, EvolutionService],
})
export class WhatsappModule {}
