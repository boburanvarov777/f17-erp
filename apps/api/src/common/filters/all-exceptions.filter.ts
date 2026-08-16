import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = 'Internal server error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      message = typeof r === 'string' ? r : (r as any).message ?? r;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = exception.code;
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = `Duplicate value: ${(exception.meta?.target as string[])?.join(', ') ?? 'unique field'}`;
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found';
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = exception.message.split('\n').pop();
      }
    } else if (exception instanceof Error) {
      message = exception.message;
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
