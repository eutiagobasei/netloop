/**
 * Utility para geração de slugs
 */
export class SlugUtil {
  /**
   * Gera um slug a partir de um nome
   * - Converte para minúsculas
   * - Remove acentos
   * - Substitui caracteres especiais por hífen
   * - Remove hífens duplicados e nas bordas
   */
  static generate(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
