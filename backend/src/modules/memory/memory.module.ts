import { Module, forwardRef } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AIModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    forwardRef(() => ContactsModule),
    forwardRef(() => AIModule),
    SettingsModule,
  ],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
