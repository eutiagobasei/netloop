import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, Matches, MaxLength, MinLength, IsEnum } from 'class-validator';
import { MembersVisibility } from '@prisma/client';

export class UpdateGroupDto {
  @ApiProperty({ example: 'SOMA', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

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

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ enum: MembersVisibility, required: false, description: 'Visibilidade entre membros (v2)' })
  @IsOptional()
  @IsEnum(MembersVisibility)
  membersVisibility?: MembersVisibility;
}
