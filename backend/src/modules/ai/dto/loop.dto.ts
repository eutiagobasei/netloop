import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para criar um plano estratégico do Loop
 */
export class CreateLoopPlanDto {
  @ApiProperty({
    description: 'Objetivo do usuário para o qual o Loop criará um plano de ação',
    example: 'Quero captar investimento seed de 500k para minha startup',
  })
  @IsString()
  @IsNotEmpty({ message: 'O objetivo é obrigatório' })
  @MinLength(10, { message: 'O objetivo deve ter pelo menos 10 caracteres' })
  @MaxLength(1000, { message: 'O objetivo deve ter no máximo 1000 caracteres' })
  goal: string;
}

/**
 * Item de ação no plano do Loop
 */
export interface LoopActionItem {
  contactId: string;
  contactName: string;
  order: number;
  level: 1 | 2;
  approach: string;
  whatToAsk: string;
  unlocks: string[];
}

/**
 * Lacuna identificada na rede
 */
export interface LoopGap {
  need: string;
  description: string;
}

/**
 * Resposta do plano do Loop
 */
export interface LoopPlanResponse {
  goal: string;
  decomposedNeeds: string[];
  actionPlan: LoopActionItem[];
  gaps: LoopGap[];
  generatedAt: string;
  contactsAnalyzed: number;
  totalContacts: number;
}

/**
 * Contato formatado para o Loop
 */
export interface LoopContact {
  id: string;
  name: string;
  profession: string;
  skills: string[];
  company: string | null;
  level: 1 | 2;
  connected_through: string | null;
  last_interaction: string | null;
  interaction_notes: string | null;
}

/**
 * Dados da rede formatados para o Loop
 */
export interface LoopNetworkData {
  userProfile: {
    name: string;
    email: string;
  };
  contacts: LoopContact[];
  totalContacts: number;
  analyzedContacts: number;
}
