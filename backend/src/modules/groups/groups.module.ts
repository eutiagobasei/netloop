import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { TagsModule } from '../tags/tags.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [TagsModule, WhatsappModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
