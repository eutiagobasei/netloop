import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, MinLength } from 'class-validator';

export class ClubAdminLoginDto {
  @ApiProperty({ example: 'admin@clube.com', description: 'Email do admin do clube' })
  @IsEmail({}, { message: 'Email deve ser válido' })
  email: string;

  @ApiProperty({ example: 'senha123', description: 'Senha do admin' })
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;
}

export class ClubAdminLoginResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'Informações do admin e clube' })
  admin: {
    id: string;
    email: string;
    name: string;
    clubId: string;
    clubName: string;
    clubSlug: string;
  };
}
