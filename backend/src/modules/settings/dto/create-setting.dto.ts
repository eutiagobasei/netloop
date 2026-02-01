import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { SettingCategory } from '@prisma/client';

export class CreateSettingDto {
  @ApiProperty({ example: 'openai_api_key' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'sk-...' })
  @IsString()
  value: string;

  @ApiProperty({ enum: SettingCategory, default: SettingCategory.SYSTEM })
  @IsEnum(SettingCategory)
  category: SettingCategory;

  @ApiProperty({ default: false })
  @IsBoolean()
  @IsOptional()
  isEncrypted?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
