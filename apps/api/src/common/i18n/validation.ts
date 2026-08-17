import { BadRequestException, ValidationError } from '@nestjs/common';
import { LocalizedRef, badRequestAll } from './api-errors';
import { MessageKey, hasMessage } from './messages';

/** class-validator constraint → localized message key. */
const CONSTRAINT_KEYS: Record<string, MessageKey> = {
  isDefined: 'v_required',
  isNotEmpty: 'v_required',
  isString: 'v_required',
  arrayNotEmpty: 'v_required',
  minLength: 'v_min_length',
  maxLength: 'v_max_length',
  min: 'v_min',
  max: 'v_max',
  isInt: 'v_number',
  isNumber: 'v_number',
  isPositive: 'v_positive',
  isDateString: 'v_date',
  isDate: 'v_date',
  isEmail: 'v_email',
  matches: 'v_format',
  isUrl: 'v_format',
  isUuid: 'v_format',
};

/** The numeric bound only exists inside the English default text. */
function bound(text?: string): number | undefined {
  const found = text?.match(/-?\d+/)?.[0];
  return found == null ? undefined : Number(found);
}

/** Known properties get a translated label; anything else keeps its raw name. */
function label(property: string): string {
  return hasMessage(`f_${property}`) ? `f_${property}` : property;
}

function collect(errors: ValidationError[], parent = ''): LocalizedRef[] {
  const refs: LocalizedRef[] = [];

  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const field = parent ? path : label(error.property);

    for (const [constraint, text] of Object.entries(error.constraints ?? {})) {
      const key = CONSTRAINT_KEYS[constraint] ?? 'v_invalid';
      const n = bound(text);
      refs.push({ key, vars: n == null ? { field } : { field, n } });
    }
    if (error.children?.length) refs.push(...collect(error.children, path));
  }

  // One message per field keeps the toast readable.
  const seen = new Set<string>();
  return refs.filter((r) => {
    const field = String(r.vars?.field ?? '');
    if (seen.has(field)) return false;
    seen.add(field);
    return true;
  });
}

/** ValidationPipe factory: class-validator only speaks English, so re-map its constraints. */
export function validationException(errors: ValidationError[]): BadRequestException {
  const refs = collect(errors);
  return refs.length
    ? badRequestAll(refs)
    : badRequestAll([{ key: 'v_invalid', vars: { field: errors.map((e) => e.property).join(', ') } }]);
}
