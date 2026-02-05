import { ConnectionStrength } from '@prisma/client';

export interface GraphNode {
  id: string;
  name: string;
  type: 'user' | 'contact' | 'mentioned';
  degree: number;
  tags?: { id: string; name: string; color: string | null }[];
  company?: string | null;
  position?: string | null;
  description?: string | null; // Para conexões mencionadas
  phone?: string | null;
  email?: string | null;
  context?: string | null;
  location?: string | null;
  sharedByCount?: number;
  sharedByUsers?: { id: string; name: string }[];
  isShared?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  strength: ConnectionStrength;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
