import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { newId } from '../ids/uuid-v7.js';
import { resolveRequestId } from './request-id.domain.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** First middleware: req.id (read by pino-http and the error filter) + the X-Request-Id response header. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = resolveRequestId(req.headers['x-request-id'], newId);
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

/** The id the middleware assigned; a fresh one only if the request somehow bypassed it. */
export const requestIdOf = (req: IncomingMessage): string =>
  typeof req.id === 'string' ? req.id : newId();
