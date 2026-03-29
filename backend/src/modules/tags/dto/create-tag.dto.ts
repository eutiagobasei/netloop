import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, Matches } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ example: 'Tecnologia' })
  @IsString()
  name: string;

  @ApiProperty({ example: '#6366f1', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor deve estar no formato hex (#RRGGBB)' })
  color?: string;
}
