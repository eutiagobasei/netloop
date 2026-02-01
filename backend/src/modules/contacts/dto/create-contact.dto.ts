import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsArray, IsUUID } from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ example: 'Maria Santos' })
  @IsString()
  name: string;

  @ApiProperty({ example: '+5511988888888', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'maria@empresa.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Tech Corp', required: false })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty({ example: 'CTO', required: false })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiProperty({ example: 'São Paulo, SP', required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ example: 'Conheci no evento de tecnologia', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: 'Especialista em cloud computing', required: false })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiProperty({ example: 'Transcrição original do áudio', required: false })
  @IsOptional()
  @IsString()
  rawTranscription?: string;

  @ApiProperty({ description: 'IDs das tags para associar', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}
