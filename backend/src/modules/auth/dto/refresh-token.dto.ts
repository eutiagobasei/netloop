import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token para renovar os tokens' })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
