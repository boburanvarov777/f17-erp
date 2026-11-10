/** Units a material can be counted in (Ombor). Keys are stored; labels via i18n `unit_<key>`. */
export const MATERIAL_UNITS = ['m', 'kg', 'dona', 'rulon', 'pachka', 'juft', 'komplekt', 'litr'];

/** The fixed list, plus a legacy custom value already stored on the material. */
export function unitOptions(current?: string | null): string[] {
  const c = (current ?? '').trim();
  return c && !MATERIAL_UNITS.includes(c) ? [...MATERIAL_UNITS, c] : MATERIAL_UNITS;
}
