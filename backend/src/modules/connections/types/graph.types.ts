import { ConnectionStrength } from '@prisma/client';

export interface GraphNode {
  id: string;
  name: string;
  type: 'user' | 'contact';
  degree: number;
  tags?: { id: string; name: string; color: string | null }[];
  company?: string | null;
  position?: string | null;
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
