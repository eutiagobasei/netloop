import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { PromptsController } from './prompts.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController, PromptsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
