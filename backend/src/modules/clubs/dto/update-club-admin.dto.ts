import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class UpdateClubAdminDto {
  @ApiProperty({ example: 'João Silva', required: false, description: 'Nome do admin' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: 'novaSenha123', required: false, description: 'Nova senha' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  @MaxLength(100)
  password?: string;

  @ApiProperty({ example: true, required: false, description: 'Se o admin está ativo' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
