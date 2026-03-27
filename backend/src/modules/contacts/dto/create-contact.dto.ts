import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsArray,
  IsUUID,
  IsNotEmpty,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PhoneUtil } from '../../../common/utils/phone.util';

/**
 * Custom validator that uses PhoneUtil.isValid() for phone validation
 * This ensures DTO validation matches the actual normalization logic
 */
@ValidatorConstraint({ name: 'isValidBrazilianPhone', async: false })
export class IsValidBrazilianPhone implements ValidatorConstraintInterface {
  validate(phone: string): boolean {
    return PhoneUtil.isValid(phone);
  }

  defaultMessage(): string {
    return 'Telefone inválido. Use formato brasileiro: 21987654321 ou +5521987654321';
  }
}

export class CreateContactDto {
  @ApiProperty({ example: 'Maria Santos' })
  @IsString()
  name: string;

  @ApiProperty({
    example: '5511988888888',
    required: true,
    description: 'Telefone obrigatório. Formato: 5511988888888 (código país + DDD + número)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  @Validate(IsValidBrazilianPhone)
  phone: string;

  @ApiProperty({ example: 'maria@empresa.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'São Paulo, SP', required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ example: 'Conheci no evento de tecnologia', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    example: 'CTO da Tech Corp, especialista em cloud computing',
    required: false,
    description: 'Informações profissionais: cargo, empresa, especialidade',
  })
  @IsOptional()
  @IsString()
  professionalInfo?: string;

  @ApiProperty({
    example: 'Conheceu na SIPAT 2024, indicação do João',
    required: false,
    description: 'Contexto do relacionamento: como/onde se conheceram',
  })
  @IsOptional()
  @IsString()
  relationshipContext?: string;

  @ApiProperty({
    example: 'CTO da Tech Corp, especialista em cloud computing, conheceu na SIPAT 2024',
    required: false,
    description: 'Contexto geral (legado - usar professionalInfo e relationshipContext)',
  })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiProperty({ example: 'Transcrição original do áudio', required: false })
  @IsOptional()
  @IsString()
  rawTranscription?: string;

  @ApiProperty({ description: 'IDs das tags para associar', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}
