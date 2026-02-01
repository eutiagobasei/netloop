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

export interface ExtractionResult {
  success: boolean;
  data: ExtractedContactData;
  rawResponse?: string;
}
