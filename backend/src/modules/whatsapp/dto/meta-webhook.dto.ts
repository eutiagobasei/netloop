import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTOs for Meta WhatsApp Cloud API Webhooks
 * Documentation: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

export class MetaWebhookTextDto {
  @ApiProperty({ description: 'Text message body' })
  @IsString()
  @IsNotEmpty()
  body: string;
}

export class MetaWebhookMediaDto {
  @ApiProperty({ description: 'Media ID for download' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiPropertyOptional({ description: 'MIME type of the media' })
  @IsOptional()
  @IsString()
  mime_type?: string;

  @ApiPropertyOptional({ description: 'SHA256 hash of the media' })
  @IsOptional()
  @IsString()
  sha256?: string;

  @ApiPropertyOptional({ description: 'Caption for images/videos' })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ description: 'Filename for documents' })
  @IsOptional()
  @IsString()
  filename?: string;
}

export class MetaWebhookContactNameDto {
  @ApiProperty({ description: 'Formatted full name' })
  @IsString()
  @IsNotEmpty()
  formatted_name: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  last_name?: string;
}

export class MetaWebhookContactPhoneDto {
  @ApiProperty({ description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: 'WhatsApp ID' })
  @IsOptional()
  @IsString()
  wa_id?: string;

  @ApiPropertyOptional({ description: 'Phone type' })
  @IsOptional()
  @IsString()
  type?: string;
}

export class MetaWebhookContactDto {
  @ApiProperty({ description: 'Contact name details' })
  @ValidateNested()
  @Type(() => MetaWebhookContactNameDto)
  name: MetaWebhookContactNameDto;

  @ApiPropertyOptional({ description: 'Phone numbers', type: [MetaWebhookContactPhoneDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookContactPhoneDto)
  phones?: MetaWebhookContactPhoneDto[];
}

export class MetaWebhookProfileDto {
  @ApiProperty({ description: 'Profile name' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class MetaWebhookMessageContactDto {
  @ApiProperty({ description: 'WhatsApp profile info' })
  @ValidateNested()
  @Type(() => MetaWebhookProfileDto)
  profile: MetaWebhookProfileDto;

  @ApiProperty({ description: 'WhatsApp ID (phone number)' })
  @IsString()
  @IsNotEmpty()
  wa_id: string;
}

export class MetaWebhookMessageDto {
  @ApiProperty({ description: 'Message ID' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Sender phone number' })
  @IsString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ description: 'Unix timestamp' })
  @IsString()
  @IsNotEmpty()
  timestamp: string;

  @ApiProperty({
    description: 'Message type',
    enum: ['text', 'audio', 'image', 'video', 'document', 'contacts', 'sticker', 'location'],
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ description: 'Text message content' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MetaWebhookTextDto)
  text?: MetaWebhookTextDto;

  @ApiPropertyOptional({ description: 'Audio message content' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MetaWebhookMediaDto)
  audio?: MetaWebhookMediaDto;

  @ApiPropertyOptional({ description: 'Image message content' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MetaWebhookMediaDto)
  image?: MetaWebhookMediaDto;

  @ApiPropertyOptional({ description: 'Video message content' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MetaWebhookMediaDto)
  video?: MetaWebhookMediaDto;

  @ApiPropertyOptional({ description: 'Document message content' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MetaWebhookMediaDto)
  document?: MetaWebhookMediaDto;

  @ApiPropertyOptional({ description: 'Contact cards', type: [MetaWebhookContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookContactDto)
  contacts?: MetaWebhookContactDto[];
}

export class MetaWebhookStatusDto {
  @ApiProperty({ description: 'Message ID' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Recipient phone number' })
  @IsString()
  @IsNotEmpty()
  recipient_id: string;

  @ApiProperty({
    description: 'Status',
    enum: ['sent', 'delivered', 'read', 'failed'],
  })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiProperty({ description: 'Unix timestamp' })
  @IsString()
  @IsNotEmpty()
  timestamp: string;
}

export class MetaWebhookMetadataDto {
  @ApiProperty({ description: 'Display phone number' })
  @IsString()
  @IsNotEmpty()
  display_phone_number: string;

  @ApiProperty({ description: 'Phone number ID' })
  @IsString()
  @IsNotEmpty()
  phone_number_id: string;
}

export class MetaWebhookValueDto {
  @ApiProperty({ description: 'Messaging product (always "whatsapp")' })
  @IsString()
  @IsNotEmpty()
  messaging_product: string;

  @ApiProperty({ description: 'Metadata about the business phone' })
  @ValidateNested()
  @Type(() => MetaWebhookMetadataDto)
  metadata: MetaWebhookMetadataDto;

  @ApiPropertyOptional({
    description: 'Contact info of the sender',
    type: [MetaWebhookMessageContactDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookMessageContactDto)
  contacts?: MetaWebhookMessageContactDto[];

  @ApiPropertyOptional({ description: 'Incoming messages', type: [MetaWebhookMessageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookMessageDto)
  messages?: MetaWebhookMessageDto[];

  @ApiPropertyOptional({ description: 'Message statuses', type: [MetaWebhookStatusDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookStatusDto)
  statuses?: MetaWebhookStatusDto[];
}

export class MetaWebhookChangeDto {
  @ApiProperty({ description: 'Webhook value' })
  @ValidateNested()
  @Type(() => MetaWebhookValueDto)
  value: MetaWebhookValueDto;

  @ApiProperty({ description: 'Field name (always "messages")' })
  @IsString()
  @IsNotEmpty()
  field: string;
}

export class MetaWebhookEntryDto {
  @ApiProperty({ description: 'WhatsApp Business Account ID' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Changes array', type: [MetaWebhookChangeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookChangeDto)
  changes: MetaWebhookChangeDto[];
}

export class MetaWebhookDto {
  @ApiProperty({ description: 'Object type (always "whatsapp_business_account")' })
  @IsString()
  @IsNotEmpty()
  object: string;

  @ApiProperty({ description: 'Entries array', type: [MetaWebhookEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookEntryDto)
  entry: MetaWebhookEntryDto[];
}

/**
 * Query parameters for Meta webhook verification
 */
export class MetaVerifyQueryDto {
  @ApiProperty({ description: 'Verification mode (should be "subscribe")' })
  @IsString()
  @IsNotEmpty()
  'hub.mode': string;

  @ApiProperty({ description: 'Verification token (must match your configured token)' })
  @IsString()
  @IsNotEmpty()
  'hub.verify_token': string;

  @ApiProperty({ description: 'Challenge string to return' })
  @IsString()
  @IsNotEmpty()
  'hub.challenge': string;
}
