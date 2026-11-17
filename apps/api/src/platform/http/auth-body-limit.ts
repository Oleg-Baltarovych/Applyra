import type { NextFunction, Request, Response } from 'express';
import { AppException } from './app-exception.js';
import { toApiError } from './error-mapping.domain.js';
import { requestIdOf } from './request-id.middleware.js';

/** JSON body limit (06-api.md §5); the adapter's express.json gets the same value (auth.module.ts). */
export const JSON_BODY_LIMIT_BYTES = 1024 * 1024;
const AUTH_BASE_PATH = '/api/auth';

const isAuthPath = (req: Request): boolean => {
  const path = req.originalUrl.split('?')[0] ?? '';
  return path === AUTH_BASE_PATH || path.startsWith(`${AUTH_BASE_PATH}/`);
};

function reject(req: Request, res: Response, err: unknown): void {
  const { status, body } = toApiError(err, requestIdOf(req));
  // The rest of the body is not read: close the connection instead of draining it.
  res.setHeader('Connection', 'close');
  res.status(status).json(body);
}

const tooLarge = () => new AppException('PAYLOAD_TOO_LARGE', 'Payload too large');
// Mapped by toApiError's body-parser branch (status 400 → VALIDATION_ERROR).
const badLength = () =>
  Object.assign(new Error('Invalid Content-Length'), {
    type: 'content-length.invalid',
    status: 400,
  });

/**
 * Better Auth (better-call 1.4.5 `toNodeHandler`) reads /api/auth bodies without any size limit, so this caps them
 * at 1 MB before it runs (413/400 use the ApiError shape — our middleware, not Better Auth):
 * - a declared Content-Length > 1 MB → 413 at once; a non-numeric one → 400 (Node's parser normally rejects it first);
 * - no Content-Length (chunked): the body is read here, counting bytes; past 1 MB → 413 and the request is dropped,
 *   otherwise it is handed on as `req.body` (a string), which better-call uses once the stream has ended.
 */
export function authBodyLimit(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthPath(req)) return next();
  const declared = req.headers['content-length'];
  if (declared !== undefined) {
    if (!/^\d+$/.test(declared)) return reject(req, res, badLength());
    if (Number(declared) > JSON_BODY_LIMIT_BYTES) return reject(req, res, tooLarge());
    return next();
  }
  if (req.headers['transfer-encoding'] === undefined) return next();

  const chunks: Buffer[] = [];
  let size = 0;
  let done = false;
  const onData = (chunk: Buffer) => {
    size += chunk.length;
    if (size <= JSON_BODY_LIMIT_BYTES) {
      chunks.push(chunk);
      return;
    }
    done = true;
    req.off('data', onData);
    res.once('finish', () => req.destroy());
    reject(req, res, tooLarge());
  };
  req.on('data', onData);
  req.once('end', () => {
    if (done) return;
    done = true;
    req.body = Buffer.concat(chunks).toString('utf8');
    next();
  });
  req.once('error', (err) => {
    if (done) return;
    done = true;
    next(err);
  });
}
