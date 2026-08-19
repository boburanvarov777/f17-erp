export const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'] as const;
export const NUMERIC_SIZES = ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56'] as const;

export const SIZE_CUSTOM = '__custom__';

const NUMERIC_SET = new Set<string>(NUMERIC_SIZES);
const LETTER_UPPER = new Set<string>(LETTER_SIZES.map((s) => s.toUpperCase()));

export function isKnownSize(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (NUMERIC_SET.has(t)) return true;
  return LETTER_UPPER.has(t.toUpperCase());
}

export function isNumericSize(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

export function mergeSizeOptions(extra: string[] = []): { letters: readonly string[]; numbers: readonly string[]; extra: string[] } {
  const more = [...new Set(extra.map((s) => s.trim()).filter(Boolean))]
    .filter((s) => !isKnownSize(s))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { letters: LETTER_SIZES, numbers: NUMERIC_SIZES, extra: more };
}
