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
}
