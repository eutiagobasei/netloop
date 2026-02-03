export interface ExtractedContactData {
  name?: string;
  company?: string;
  position?: string;
  phone?: string;
  email?: string;
  location?: string;
  context?: string;
  tags?: string[];
  confidence?: number;
}

export interface MentionedConnectionData {
  name: string;
  about?: string;
  tags?: string[];
  phone?: string;
}

export interface ExtractionResult {
  success: boolean;
  data: ExtractedContactData;
  rawResponse?: string;
}

export interface ExtractionWithConnectionsResult {
  success: boolean;
  contact: ExtractedContactData;
  connections: MentionedConnectionData[];
  rawResponse?: string;
}
