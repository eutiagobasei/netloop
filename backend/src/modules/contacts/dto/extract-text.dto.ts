import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ExtractTextDto {
  @ApiProperty({
    description: 'Texto livre para extração de dados de contato',
    example: 'Conheci João Silva da empresa XYZ, ele é diretor de marketing. Ele mencionou que conhece a Maria que trabalha com vendas.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  text: string;
}
