import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsBoolean } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: false, required: false, description: 'Se o membro é admin do grupo' })
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;
}
