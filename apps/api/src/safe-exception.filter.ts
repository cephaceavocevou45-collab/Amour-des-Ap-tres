import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) {
      const details = exception instanceof Error ? exception : new Error(String(exception));
      const prismaCode = /\bP\d{4}\b/.exec(details.message)?.[0];
      this.logger.error(`Request failed (${status}; ${details.name}${prismaCode ? `; ${prismaCode}` : ''})`);
      response.status(status).json({ statusCode: status, message: 'Une erreur interne est survenue.' });
      return;
    }
    const body = exception instanceof HttpException ? exception.getResponse() : { message: 'Requête impossible.' };
    const safe = (value: unknown): unknown => {
      if (typeof value === 'string') return /(?:DATABASE_URL|JWT_ACCESS_SECRET|TOTP_ENCRYPTION_KEY|RESEND_API_KEY|relation .*does not exist|table .*does not exist|column .*does not exist|[A-Za-z]:\\|\/(?:app|workspace|home|Users|var|tmp)\/)/i.test(value) ? 'Requête impossible.' : value;
      if (Array.isArray(value)) return value.map(safe);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safe(item)]));
      return value;
    };
    response.status(status).json(safe(typeof body === 'string' ? { statusCode: status, message: body } : body));
  }
}
