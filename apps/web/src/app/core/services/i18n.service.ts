import { Injectable, computed, effect, signal } from '@angular/core';
import type { Lang } from '../models';
import { DICT } from './i18n.dict';

const KEY = 'f17_lang';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>((localStorage.getItem(KEY) as Lang) || 'uz');
  readonly dict = computed(() => DICT[this.lang()]);

  constructor() {
    effect(() => {
      const l = this.lang();
      localStorage.setItem(KEY, l);
      document.documentElement.lang = l;
    });
  }

  set(lang: Lang): void {
    this.lang.set(lang);
  }

  /** Translate a key; unknown keys fall back to Uzbek, then to the key itself. */
  t(key: string, vars?: Record<string, string | number>): string {
    let s = (DICT[this.lang()] as Record<string, string>)[key] ?? (DICT.uz as Record<string, string>)[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }
}
