import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { toApiError } from './error-mapping.domain.js';
import { requestIdOf } from './request-id.middleware.js';

/**
 * Global filter (APP_FILTER): every error outside /api/auth/* becomes the 06-api.md §3 body. The stack and the raw
 * error go to the log (with requestId via the pino request context), never into the body.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(err: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { status, body, log } = toApiError(err, requestIdOf(req));
    if (log !== 'none') this.logger[log]({ err, errorCode: body.code }, 'request failed');
    if (res.headersSent) return;
    res.status(status).json(body);
  }
}
