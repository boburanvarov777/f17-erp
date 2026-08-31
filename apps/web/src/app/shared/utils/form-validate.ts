import { signal } from '@angular/core';

export interface ValidateRule {
  key: string;
  label: string;
  value: unknown;
  required?: boolean;
  when?: () => boolean;
  min?: number;
  minLength?: number;
  custom?: (value: unknown) => string | null;
}

export function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return !v.trim();
  return false;
}

export function isMissingQty(v: unknown): boolean {
  if (v == null || v === '') return true;
  const n = Number(v);
  return !Number.isFinite(n) || n <= 0;
}

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

export function runValidation(rules: ValidateRule[], t: TranslateFn): Record<string, string> | null {
  const errors: Record<string, string> = {};
  for (const r of rules) {
    if (r.when && !r.when()) continue;
    if (r.custom) {
      const msg = r.custom(r.value);
      if (msg) errors[r.key] = msg;
      continue;
    }
    if (r.required && isBlank(r.value)) {
      errors[r.key] = t('field_required', { field: r.label });
      continue;
    }
    if (r.min != null && !isBlank(r.value)) {
      const n = Number(r.value);
      if (!Number.isFinite(n) || n < r.min) {
        errors[r.key] = t('field_min', { field: r.label, n: r.min });
      }
    }
    if (r.minLength != null && typeof r.value === 'string') {
      const len = r.value.trim().length;
      if (len > 0 && len < r.minLength) {
        errors[r.key] = t('field_min_length', { field: r.label, n: r.minLength });
      }
    }
  }
  return Object.keys(errors).length ? errors : null;
}

/** Per-form field error state for modal validation on submit. */
export class FieldErrorsState {
  readonly errors = signal<Record<string, string>>({});

  get(key: string): string | null {
    return this.errors()[key] ?? null;
  }

  has(key: string): boolean {
    return !!this.errors()[key];
  }

  clear(key: string): void {
    if (!this.errors()[key]) return;
    const next = { ...this.errors() };
    delete next[key];
    this.errors.set(next);
  }

  reset(): void {
    this.errors.set({});
  }

  /** Returns true when form is valid (no errors). */
  apply(map: Record<string, string> | null): boolean {
    this.errors.set(map ?? {});
    return !map;
  }

  keys(): string[] {
    return Object.keys(this.errors());
  }
}

const API_FIELD_KEYS: Record<string, string> = {
  f_code: 'code',
  f_name: 'name',
  code: 'code',
  name: 'name',
};

/** Map NestJS DTO validation (`i18n` refs) onto form field keys. */
export function applyApiValidationErrors(err: { error?: { message?: string | string[]; i18n?: unknown } }): Record<string, string> | null {
  const raw = err?.error?.i18n;
  if (!raw) return null;
  const refs = (Array.isArray(raw) ? raw : [raw]) as { vars?: { field?: string } }[];
  const messages = err?.error?.message;
  const msgList = Array.isArray(messages) ? messages : messages ? [messages] : [];
  const errors: Record<string, string> = {};

  refs.forEach((ref, i) => {
    const field = String(ref?.vars?.field ?? '');
    const key = API_FIELD_KEYS[field] ?? field.replace(/^f_/, '');
    if (!key) return;
    errors[key] = msgList[i] ?? msgList[0] ?? field;
  });

  return Object.keys(errors).length ? errors : null;
}

/** Scroll modal/page to the first invalid field and focus its input. */
export function focusFirstInvalidField(keys: string[]): void {
  queueMicrotask(() => {
    for (const key of keys) {
      const wrap = document.querySelector(`[data-field="${key}"]`);
      if (!wrap) continue;
      wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (wrap.querySelector('input, select, textarea') as HTMLElement | null)?.focus();
      break;
    }
  });
}
