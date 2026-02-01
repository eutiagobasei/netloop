import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class SettingUpdateItem {
  @ApiProperty({ example: 'openai_api_key' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'sk-...', required: false })
  @IsString()
  @IsOptional()
  value?: string;
}

export class BulkUpdateSettingsDto {
  @ApiProperty({ type: [SettingUpdateItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingUpdateItem)
  settings: SettingUpdateItem[];
}
