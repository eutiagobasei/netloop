import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
  Matches,
} from 'class-validator';

export class InviteItemDto {
  @ApiProperty({ example: 'João Silva', description: 'Nome do convidado' })
  @IsString()
  name: string;

  @ApiProperty({ example: '11999999999', description: 'Telefone (apenas números)' })
  @IsString()
  @Matches(/^\d{10,13}$/, {
    message: 'Telefone deve conter entre 10 e 13 dígitos numéricos',
  })
  phone: string;

  @ApiProperty({ example: 'Tech Corp', required: false, description: 'Nome da empresa' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty({
    example: 'Empresa de tecnologia',
    required: false,
    description: 'Descrição da empresa',
  })
  @IsOptional()
  @IsString()
  companyDescription?: string;
}

export class ImportInvitesDto {
  @ApiProperty({
    type: [InviteItemDto],
    description: 'Lista de convites a serem importados',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Deve conter pelo menos 1 convite' })
  @ValidateNested({ each: true })
  @Type(() => InviteItemDto)
  invites: InviteItemDto[];
}

export class ImportInvitesResponseDto {
  @ApiProperty({ example: 10, description: 'Novos convites criados' })
  created: number;

  @ApiProperty({ example: 2, description: 'Convites duplicados (já existiam)' })
  duplicates: number;

  @ApiProperty({ example: 1, description: 'Pessoas que já são membros do grupo' })
  alreadyMembers: number;

  @ApiProperty({ example: [], description: 'Erros de validação' })
  errors: string[];
}
