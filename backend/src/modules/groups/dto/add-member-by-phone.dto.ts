import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, Matches } from 'class-validator';

export class AddMemberByPhoneDto {
  @ApiProperty({ example: 'João Silva', description: 'Nome do membro' })
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

  @ApiProperty({ example: 'joao@example.com', required: false, description: 'Email do membro' })
  @IsOptional()
  @IsEmail({}, { message: 'Email deve ser válido' })
  email?: string;
}

export class AddMemberByPhoneResponseDto {
  @ApiProperty({
    enum: ['added', 'invited'],
    description: 'Status: added = usuário existente adicionado direto, invited = convite criado',
  })
  status: 'added' | 'invited';

  @ApiProperty({ example: 'João Silva adicionado ao grupo' })
  message: string;
}
