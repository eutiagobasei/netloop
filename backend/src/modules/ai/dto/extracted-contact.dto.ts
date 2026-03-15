export interface ExtractedContactData {
  name?: string;
  phone?: string;
  email?: string;
  location?: string;
  context?: string; // Full context including company, position, how they met, etc.
  tags?: string[];
  confidence?: number;
}

export interface ExtractionResult {
  success: boolean;
  data: ExtractedContactData;
  rawResponse?: string;
}
