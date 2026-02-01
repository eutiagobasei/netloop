import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ConnectionStrength } from '@prisma/client';

export class UpdateConnectionDto {
  @ApiProperty({ enum: ConnectionStrength, required: false })
  @IsOptional()
  @IsEnum(ConnectionStrength)
  strength?: ConnectionStrength;

  @ApiProperty({ example: 'Conheci no evento de tecnologia', required: false })
  @IsOptional()
  @IsString()
  context?: string;
}
