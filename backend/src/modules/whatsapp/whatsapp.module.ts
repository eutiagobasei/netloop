import { Module, forwardRef } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { EvolutionService } from './evolution.service';
import { ContactsModule } from '../contacts/contacts.module';
import { ConnectionsModule } from '../connections/connections.module';
import { AIModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';
import { RegistrationModule } from '../registration/registration.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ContactsModule,
    ConnectionsModule,
    forwardRef(() => AIModule),
    SettingsModule,
    forwardRef(() => RegistrationModule),
    UsersModule,
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService, EvolutionService],
  exports: [WhatsappService, EvolutionService],
})
export class WhatsappModule {}
