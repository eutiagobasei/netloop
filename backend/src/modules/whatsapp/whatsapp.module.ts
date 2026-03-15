import { Module, forwardRef } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { EvolutionService } from './evolution.service';
import {
  EvolutionProvider,
  MetaCloudProvider,
  MessagingProviderFactory,
} from './providers';
import { ContactsModule } from '../contacts/contacts.module';
import { ConnectionsModule } from '../connections/connections.module';
import { AIModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';
import { RegistrationModule } from '../registration/registration.module';
import { UsersModule } from '../users/users.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [
    ContactsModule,
    ConnectionsModule,
    forwardRef(() => AIModule),
    SettingsModule,
    forwardRef(() => RegistrationModule),
    UsersModule,
    MemoryModule,
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    // Legacy service (kept for backward compatibility)
    EvolutionService,
    // New provider-based architecture
    EvolutionProvider,
    MetaCloudProvider,
    MessagingProviderFactory,
  ],
  exports: [
    WhatsappService,
    // Export factory for other modules that need to send messages
    MessagingProviderFactory,
    // Legacy export (deprecated, use MessagingProviderFactory instead)
    EvolutionService,
  ],
})
export class WhatsappModule {}
