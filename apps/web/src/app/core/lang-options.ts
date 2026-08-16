import type { Lang } from './models';

export interface LangOption {
  code: Lang;
  label: string;
  short: string;
  flagClass: string;
}

export const LANG_OPTIONS: LangOption[] = [
  { code: 'uz', label: "O'zbekcha", short: 'UZ', flagClass: 'lang-uz' },
  { code: 'ru', label: 'Русский', short: 'RU', flagClass: 'lang-ru' },
  { code: 'en', label: 'English', short: 'EN', flagClass: 'lang-en' },
];

export function langOption(code: Lang): LangOption {
  return LANG_OPTIONS.find((l) => l.code === code) ?? LANG_OPTIONS[0];
}
