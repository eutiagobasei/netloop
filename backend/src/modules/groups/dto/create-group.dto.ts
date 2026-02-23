import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'SOMA' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Clube de networking para empreendedores', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: '#6366f1', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor deve estar no formato hex (#RRGGBB)' })
  color?: string;

  @ApiProperty({ example: true, required: false, description: 'Grupo verificado/oficial' })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}
