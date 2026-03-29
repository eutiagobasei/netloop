export type ChainSearchMatchType =
  | 'direct'
  | 'indirect_domain'
  | 'bridge'
  | 'not_found';

export interface ChainSearchContact {
  id: string;
  name: string;
  score: number;
  reason: string;
  relationToQuery?: string;
  isSecondDegree?: boolean;
  phone?: string;
}

export interface BridgeContact {
  name: string;
  id: string;
  phone: string | null;
}

export interface ChainSearchResult {
  matchType: ChainSearchMatchType;
  contacts: ChainSearchContact[];
  bridge?: BridgeContact;
  message: string;
  suggestion?: string;
}

export interface ChainSearchParams {
  userId: string;
  userQuery: string;
  contacts: Array<{
    id: string;
    name: string;
    context?: string;
    notes?: string;
    phone?: string;
  }>;
  secondDegreeContacts?: Array<{
    id: string;
    name: string;
    area?: string;
    connectorId: string;
    connectorName: string;
    connectorPhone: string | null;
  }>;
}
