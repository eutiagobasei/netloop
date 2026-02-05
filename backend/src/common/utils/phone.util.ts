/**
 * Utilitário para validar e normalizar números de telefone brasileiros
 * Formato de saída: 5521987654321 (apenas números, com código do país)
 */
export class PhoneUtil {
  /**
   * Normaliza telefone para formato padrão
   * Entrada: qualquer formato (21987654321, +55 21 98765-4321, etc)
   * Saída: 5521987654321 ou null se inválido
   */
  static normalize(phone: string): string | null {
    if (!phone) return null;

    // Remove tudo que não é número
    let cleaned = phone.replace(/\D/g, '');

    // Se começa com 0, remove
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    // Se não tem código do país, adiciona 55
    if (!cleaned.startsWith('55')) {
      cleaned = '55' + cleaned;
    }

    // Valida tamanho (55 + DDD + número)
    // Celular: 55 + 2 (DDD) + 9 dígitos = 13
    // Fixo: 55 + 2 (DDD) + 8 dígitos = 12
    if (cleaned.length < 12 || cleaned.length > 13) {
      return null;
    }

    return cleaned;
  }

  /**
   * Formata telefone para exibição
   * Entrada: 5521987654321
   * Saída: +55 21 98765-4321
   */
  static format(phone: string): string {
    const normalized = this.normalize(phone);
    if (!normalized) return phone;

    const country = normalized.substring(0, 2);
    const ddd = normalized.substring(2, 4);
    const rest = normalized.substring(4);

    // Celular (9 dígitos) ou fixo (8 dígitos)
    if (rest.length === 9) {
      const firstPart = rest.substring(0, 5);
      const secondPart = rest.substring(5);
      return `+${country} ${ddd} ${firstPart}-${secondPart}`;
    } else {
      const firstPart = rest.substring(0, 4);
      const secondPart = rest.substring(4);
      return `+${country} ${ddd} ${firstPart}-${secondPart}`;
    }
  }

  /**
   * Valida se é um telefone brasileiro válido
   */
  static isValid(phone: string): boolean {
    return this.normalize(phone) !== null;
  }
}
