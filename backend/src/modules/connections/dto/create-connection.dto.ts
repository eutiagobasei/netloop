import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsEnum, IsString } from 'class-validator';
import { ConnectionStrength } from '@prisma/client';

export class CreateConnectionDto {
  @ApiProperty({ description: 'ID do contato para conectar' })
  @IsUUID()
  contactId: string;

  @ApiProperty({ enum: ConnectionStrength, default: ConnectionStrength.MODERATE, required: false })
  @IsOptional()
  @IsEnum(ConnectionStrength)
  strength?: ConnectionStrength;

  @ApiProperty({ example: 'Conheci no evento de tecnologia', required: false })
  @IsOptional()
  @IsString()
  context?: string;
}
