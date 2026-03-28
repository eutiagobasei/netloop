import { Module, forwardRef } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { SearchCacheService } from './search-cache.service';
import { AIModule } from '../ai/ai.module';
import { ContactInvitesModule } from '../contact-invites/contact-invites.module';

@Module({
  imports: [forwardRef(() => AIModule), ContactInvitesModule],
  controllers: [ContactsController],
  providers: [ContactsService, SearchCacheService],
  exports: [ContactsService, SearchCacheService],
})
export class ContactsModule {}
