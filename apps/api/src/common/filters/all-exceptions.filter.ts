import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { isLocalizedBody } from '../i18n/api-errors';
import { resolveLang, translate } from '../i18n/messages';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const lang = resolveLang(req.headers as Record<string, unknown>);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = translate(lang, 'err_internal');
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (isLocalizedBody(r)) {
        message = Array.isArray(r.i18n)
          ? r.i18n.map((ref) => translate(lang, ref.key, ref.vars))
          : translate(lang, r.i18n.key, r.i18n.vars);
      } else {
        message = typeof r === 'string' ? r : (r as any).message ?? r;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = exception.code;
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = translate(lang, 'err_duplicate', {
          fields: (exception.meta?.target as string[])?.join(', ') ?? '',
        });
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = translate(lang, 'err_record_not_found');
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = exception.message.split('\n').pop();
      }
    }

    if (status >= 500) this.logger.error(`${req.method} ${req.url}`, (exception as Error)?.stack);

    res.status(status).json({
      statusCode: status,
      code,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
