import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppException } from './app-exception.js';
import { isAuthPath } from './auth-body-limit.js';
import { toApiError } from './error-mapping.domain.js';
import { requestIdOf } from './request-id.middleware.js';

/**
 * The only header Better Auth reads the client IP from (`advanced.ipAddress.ipAddressHeaders`, auth.config.ts).
 * Always overwritten here with Express `req.ip` (socket address, or the X-Forwarded-For entry of a trusted proxy hop
 * — TRUST_PROXY_HOPS), so a client cannot pick its own rate-limit bucket.
 */
export const CLIENT_IP_HEADER = 'x-applyra-client-ip';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * /api/auth/* policy on top of Better Auth (09 §3, §4.3): trusted client IP header, and every mutation must come from
 * WEB_ORIGIN (Better Auth checks Origin only when a cookie is present → login CSRF on cookie-less sign-in/social).
 * GET (OAuth callbacks) is unaffected. 403 uses our ApiError shape (CSRF_ORIGIN).
 */
export function authRequestPolicy(webOrigin: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isAuthPath(req)) return next();
    req.headers[CLIENT_IP_HEADER] = req.ip ?? req.socket.remoteAddress ?? '';
    if (MUTATIONS.has(req.method.toUpperCase()) && req.headers.origin !== webOrigin) {
      const { status, body } = toApiError(
        new AppException('CSRF_ORIGIN', 'Origin not allowed'),
        requestIdOf(req),
      );
      res.status(status).json(body);
      return;
    }
    next();
  };
}
