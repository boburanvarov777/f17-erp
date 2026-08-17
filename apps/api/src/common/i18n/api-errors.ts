import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DEFAULT_LANG, MessageKey, MessageVars, translate } from './messages';

export interface LocalizedRef {
  key: MessageKey;
  vars?: MessageVars;
}

interface LocalizedBody {
  message: string | string[];
  i18n: LocalizedRef | LocalizedRef[];
}

export function isLocalizedBody(body: unknown): body is LocalizedBody {
  return !!body && typeof body === 'object' && 'i18n' in (body as Record<string, unknown>);
}

/**
 * Carries message keys alongside default-language text, so AllExceptionsFilter
 * can render them in the caller's language.
 */
function body(key: MessageKey, vars?: MessageVars): LocalizedBody {
  return { message: translate(DEFAULT_LANG, key, vars), i18n: { key, vars } };
}

export const badRequest = (key: MessageKey, vars?: MessageVars) => new BadRequestException(body(key, vars));
export const notFound = (key: MessageKey, vars?: MessageVars) => new NotFoundException(body(key, vars));
export const forbidden = (key: MessageKey, vars?: MessageVars) => new ForbiddenException(body(key, vars));
export const unauthorized = (key: MessageKey, vars?: MessageVars) => new UnauthorizedException(body(key, vars));
export const conflict = (key: MessageKey, vars?: MessageVars) => new ConflictException(body(key, vars));

/** Same as badRequest, for several field errors at once (DTO validation). */
export function badRequestAll(refs: LocalizedRef[]): BadRequestException {
  return new BadRequestException({
    message: refs.map((r) => translate(DEFAULT_LANG, r.key, r.vars)),
    i18n: refs,
  });
}
