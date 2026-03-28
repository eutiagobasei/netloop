import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, MinLength, MaxLength } from 'class-validator';

export class CreateClubAdminDto {
  @ApiProperty({ example: 'admin@clube.com', description: 'Email do admin do clube' })
  @IsEmail({}, { message: 'Email deve ser válido' })
  email: string;

  @ApiProperty({ example: 'senha123', description: 'Senha do admin' })
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  @MaxLength(100)
  password: string;

  @ApiProperty({ example: 'João Silva', description: 'Nome do admin' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}
