export interface MemoryRequestResult {
  intent: 'edit_self' | 'edit_contact' | 'query_self' | 'query_contact' | 'other';
  target: {
    type: 'user' | 'contact';
    identifier: string | null;
    field: 'name' | 'email' | 'company' | 'position' | 'context' | 'notes' | null;
  };
  newValue: string | null;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion: string | null;
}

export interface MemorySummary {
  user: {
    name: string;
    email: string;
    phone: string | null;
    contactsCount: number;
    topTags: string[];
  };
  recentContacts: Array<{
    name: string;
    context: string | null;
  }>;
}

export interface UpdateMemoryDto {
  field: string;
  value: string;
}
