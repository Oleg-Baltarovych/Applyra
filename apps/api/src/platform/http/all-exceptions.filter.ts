import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { reportError } from '../sentry/index.js';
import { toApiError } from './error-mapping.domain.js';
import { requestIdOf } from './request-id.middleware.js';

/** Better Auth's guard puts the signed-in user here (request.user); only the id is read. */
interface MaybeUserRequest {
  user?: { id?: unknown } | null;
}

/**
 * Global filter (APP_FILTER): every error outside /api/auth/* becomes the 06-api.md §3 body. The stack and the raw
 * error go to the log (with requestId via the pino request context), never into the body. Unexpected 5xx (logged as
 * errors) also go to Sentry when it is enabled (M0-15); expected 4xx domain errors never do.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(err: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & MaybeUserRequest>();
    const res = http.getResponse<Response>();
    const { status, body, log } = toApiError(err, requestIdOf(req));
    if (log !== 'none') this.logger[log]({ err, errorCode: body.code }, 'request failed');
    // `log === 'error'` already implies a 5xx today (error-mapping.domain.ts); `status >= 500` keeps a future
    // error-level 4xx out of Sentry. A 500 for an unmapped status is logged as warn and is not reported either.
    if (status >= 500 && log === 'error') {
      const userId = req.user?.id;
      reportError(err, {
        requestId: body.requestId,
        ...(typeof userId === 'string' ? { userId } : {}),
      });
    }
    if (res.headersSent) return;
    res.status(status).json(body);
  }
}
