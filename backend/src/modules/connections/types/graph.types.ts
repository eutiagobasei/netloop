import { ConnectionStrength } from '@prisma/client';

export interface ClubInfo {
  id: string;
  name: string;
  color: string | null;
  isVerified: boolean;
}

export interface GraphNode {
  id: string;
  name: string;
  type: 'user' | 'contact' | 'mentioned' | 'club_member';
  degree: number;
  tags?: { id: string; name: string; color: string | null }[];
  clubs?: ClubInfo[]; // Clubes do usuário vinculado ao contato
  company?: string | null;
  position?: string | null;
  description?: string | null; // Para conexões mencionadas
  phone?: string | null;
  email?: string | null;
  context?: string | null;
  notes?: string | null;
  location?: string | null;
  sharedByCount?: number;
  sharedByUsers?: { id: string; name: string }[];
  isShared?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  strength: ConnectionStrength | 'CLUB';
  clubColor?: string | null; // Cor do clube para edges de club_member
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
