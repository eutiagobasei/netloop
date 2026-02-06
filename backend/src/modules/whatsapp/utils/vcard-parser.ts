/**
 * Interface for parsed vCard data
 */
export interface ParsedVCard {
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
}

/**
 * Parses a vCard string and extracts contact information
 * @param vcard - The vCard string to parse
 * @returns Parsed contact data
 */
export function parseVCard(vcard: string): ParsedVCard {
  const result: ParsedVCard = {
    name: '',
    phone: null,
    email: null,
    company: null,
  };

  if (!vcard) {
    return result;
  }

  // Normalize line endings
  const lines = vcard.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Extract formatted name (FN)
    if (trimmedLine.startsWith('FN:')) {
      result.name = trimmedLine.substring(3).trim();
    }

    // Extract phone number (TEL)
    if (trimmedLine.startsWith('TEL') || trimmedLine.includes('TEL;')) {
      const phoneMatch = trimmedLine.match(/TEL[^:]*:(.+)/i);
      if (phoneMatch) {
        // Clean phone number: remove non-numeric except +
        const rawPhone = phoneMatch[1].trim();
        result.phone = normalizePhone(rawPhone);
      }
    }

    // Extract email (EMAIL)
    if (trimmedLine.startsWith('EMAIL') || trimmedLine.includes('EMAIL;')) {
      const emailMatch = trimmedLine.match(/EMAIL[^:]*:(.+)/i);
      if (emailMatch) {
        result.email = emailMatch[1].trim();
      }
    }

    // Extract organization/company (ORG)
    if (trimmedLine.startsWith('ORG:') || trimmedLine.startsWith('ORG;')) {
      const orgMatch = trimmedLine.match(/ORG[^:]*:(.+)/i);
      if (orgMatch) {
        // ORG can have multiple parts separated by ;
        result.company = orgMatch[1].split(';')[0].trim();
      }
    }
  }

  // Fallback: if no FN, try to extract from N field
  if (!result.name) {
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('N:') || trimmedLine.startsWith('N;')) {
        const nMatch = trimmedLine.match(/N[^:]*:(.+)/i);
        if (nMatch) {
          // N format: LastName;FirstName;MiddleName;Prefix;Suffix
          const parts = nMatch[1].split(';');
          const lastName = parts[0]?.trim() || '';
          const firstName = parts[1]?.trim() || '';
          result.name = [firstName, lastName].filter(Boolean).join(' ').trim();
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Normalizes a phone number by removing non-numeric characters
 * and ensuring proper format
 */
function normalizePhone(phone: string): string {
  // Remove everything except digits and leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // If starts with +, keep it
  if (normalized.startsWith('+')) {
    normalized = normalized.substring(1);
  }

  // Remove leading zeros for international format
  normalized = normalized.replace(/^0+/, '');

  return normalized || phone;
}
