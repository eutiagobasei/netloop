export interface ExtractedContactData {
  name?: string;
  phone?: string;
  email?: string;
  location?: string;
  professionalInfo?: string; // Cargo, empresa, especialidade
  relationshipContext?: string; // Como/onde se conheceram
  context?: string; // Legado - contexto geral (mantido para compatibilidade)
  tags?: string[];
  confidence?: number;
}

export interface ExtractionResult {
  success: boolean;
  data: ExtractedContactData;
  rawResponse?: string;
}
