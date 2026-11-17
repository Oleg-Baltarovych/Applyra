import type { NextFunction, Request, Response } from 'express';
import { AppException } from './app-exception.js';
import { toApiError } from './error-mapping.domain.js';
import { requestIdOf } from './request-id.middleware.js';

/** JSON body limit (06-api.md §5); the adapter's express.json gets the same value (auth.module.ts). */
export const JSON_BODY_LIMIT_BYTES = 1024 * 1024;
const AUTH_BASE_PATH = '/api/auth';
/**
 * How much of an oversize body is read and discarded before the 413 goes out. Answering while the client is still
 * writing makes the kernel reset the socket (unread data) and the client sees ECONNRESET instead of the 413 —
 * body-parser drains for the same reason. Past this cap the socket is destroyed instead; behind Caddy (M0-14) the
 * proxy caps bodies earlier.
 */
export const AUTH_BODY_DRAIN_CAP_BYTES = 8 * 1024 * 1024;

export const isAuthPath = (req: Request): boolean => {
  const path = req.originalUrl.split('?')[0] ?? '';
  return path === AUTH_BASE_PATH || path.startsWith(`${AUTH_BASE_PATH}/`);
};

function reject(req: Request, res: Response, err: unknown): void {
  const { status, body } = toApiError(err, requestIdOf(req));
  res.setHeader('Connection', 'close');
  res.status(status).json(body);
}

/** Read and discard the rest of the body (up to the drain cap), then answer; beyond the cap drop the socket. */
function drainThenReject(req: Request, res: Response, err: unknown, alreadyRead: number): void {
  let read = alreadyRead;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    req.off('data', onData);
    reject(req, res, err);
  };
  const onData = (chunk: Buffer) => {
    read += chunk.length;
    if (read <= AUTH_BODY_DRAIN_CAP_BYTES) return;
    finished = true;
    req.off('data', onData);
    req.destroy();
  };
  if (read > AUTH_BODY_DRAIN_CAP_BYTES) {
    res.once('finish', () => req.destroy());
    return reject(req, res, err);
  }
  req.on('data', onData);
  req.once('end', finish);
  req.once('error', () => {
    finished = true;
  });
  req.resume();
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
 * - a declared Content-Length > 1 MB → 413 once the body is drained (> 8 MB: 413 + socket dropped); a non-numeric one → 400 (Node's parser normally rejects it first);
 * - no Content-Length (chunked): the body is read here, counting bytes; past 1 MB → drained like above, then 413,
 *   otherwise it is handed on as `req.body` (a string), which better-call uses once the stream has ended.
 */
export function authBodyLimit(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthPath(req)) return next();
  const declared = req.headers['content-length'];
  if (declared !== undefined) {
    if (!/^\d+$/.test(declared)) return reject(req, res, badLength());
    const length = Number(declared);
    if (length > AUTH_BODY_DRAIN_CAP_BYTES) {
      res.once('finish', () => req.destroy());
      return reject(req, res, tooLarge());
    }
    if (length > JSON_BODY_LIMIT_BYTES) return drainThenReject(req, res, tooLarge(), 0);
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
    chunks.length = 0;
    drainThenReject(req, res, tooLarge(), size);
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
