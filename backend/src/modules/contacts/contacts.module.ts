import { Module, forwardRef } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { SearchCacheService } from './search-cache.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [forwardRef(() => AIModule)],
  controllers: [ContactsController],
  providers: [ContactsService, SearchCacheService],
  exports: [ContactsService, SearchCacheService],
})
export class ContactsModule {}
