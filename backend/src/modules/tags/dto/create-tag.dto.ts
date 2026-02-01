import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsUUID, Matches } from 'class-validator';
import { TagType } from '@prisma/client';

export class CreateTagDto {
  @ApiProperty({ example: 'Tecnologia' })
  @IsString()
  name: string;

  @ApiProperty({ enum: TagType, default: TagType.FREE, required: false })
  @IsOptional()
  @IsEnum(TagType)
  type?: TagType;

  @ApiProperty({ example: '#6366f1', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor deve estar no formato hex (#RRGGBB)' })
  color?: string;

  @ApiProperty({ description: 'ID do grupo (apenas para tags institucionais)', required: false })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
