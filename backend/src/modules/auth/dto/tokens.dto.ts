import { ApiProperty } from '@nestjs/swagger';

export class TokensDto {
  @ApiProperty({ description: 'JWT Access Token' })
  accessToken: string;

  @ApiProperty({ description: 'Refresh Token para renovação' })
  refreshToken: string;

  @ApiProperty({ description: 'Tempo de expiração do access token', example: '15m' })
  expiresIn: string;
}
