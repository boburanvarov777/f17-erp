import type { Department, Lang } from './models';

/** Pick department display name for the active UI language. */
export function deptLabel(
  d: Pick<Department, 'nameUz'> & Partial<Pick<Department, 'nameRu' | 'nameEn'>>,
  lang: Lang,
): string {
  if (lang === 'ru') return d.nameRu || d.nameUz;
  if (lang === 'en') return d.nameEn || d.nameUz;
  return d.nameUz;
}
