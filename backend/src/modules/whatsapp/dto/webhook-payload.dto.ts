import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class WebhookPayloadDto {
  @ApiProperty({ description: 'ID único da mensagem no WhatsApp' })
  @IsString()
  messageId: string;

  @ApiProperty({ description: 'Telefone de origem' })
  @IsString()
  fromPhone: string;

  @ApiProperty({ description: 'Telefone de destino (usuário do sistema)' })
  @IsString()
  toPhone: string;

  @ApiProperty({ description: 'Conteúdo da mensagem de texto', required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ description: 'URL do arquivo de áudio', required: false })
  @IsOptional()
  @IsString()
  audioUrl?: string;

  @ApiProperty({ description: 'URL da imagem', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ description: 'Timestamp da mensagem', required: false })
  @IsOptional()
  @IsString()
  timestamp?: string;
}
