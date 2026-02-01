import { Module, forwardRef } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { ContactsModule } from '../contacts/contacts.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [ContactsModule, forwardRef(() => AIModule)],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
