import { IsString, IsOptional, IsBoolean, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class MessageKey {
  @IsString()
  remoteJid: string;

  @IsBoolean()
  fromMe: boolean;

  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  participant?: string;
}

class MessageContent {
  @IsOptional()
  @IsString()
  conversation?: string;

  @IsOptional()
  extendedTextMessage?: {
    text: string;
  };

  @IsOptional()
  audioMessage?: {
    url?: string;
    mimetype?: string;
  };

  @IsOptional()
  imageMessage?: {
    url?: string;
    caption?: string;
  };

  @IsOptional()
  contactMessage?: {
    displayName?: string;
    vcard: string;
  };
}

class WebhookData {
  @ValidateNested()
  @Type(() => MessageKey)
  key: MessageKey;

  @IsOptional()
  @IsString()
  pushName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MessageContent)
  message?: MessageContent;

  @IsOptional()
  @IsString()
  messageType?: string;

  @IsOptional()
  @IsNumber()
  messageTimestamp?: number;
}

export class EvolutionWebhookDto {
  @IsString()
  event: string;

  @IsOptional()
  @IsString()
  instance?: string;

  @ValidateNested()
  @Type(() => WebhookData)
  data: WebhookData;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  date_time?: string;
}
