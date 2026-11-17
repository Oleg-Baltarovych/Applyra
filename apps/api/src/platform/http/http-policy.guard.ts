import type { IncomingHttpHeaders } from 'node:http';
import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ConfigService } from '../config/index.js';
import { AppException } from './app-exception.js';
import { checkMutation } from './origin-policy.domain.js';

const ACCEPTS_MULTIPART = 'applyra:accepts-multipart';

/** Lets a handler take `multipart/form-data` in addition to JSON (CSV import). The Origin check still applies. */
export const AcceptsMultipart = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCEPTS_MULTIPART, true);

/** type-is `hasBody` semantics, except Content-Length: 0 counts as no body. */
const hasBody = (headers: IncomingHttpHeaders): boolean =>
  headers['transfer-encoding'] !== undefined || Number(headers['content-length'] ?? 0) > 0;

/**
 * The OriginGuard of 09-security-privacy.md §3 plus the JSON-only rule, as one global guard. Registered by
 * HttpModule, which AppModule imports before AuthModule, so a bad Origin is rejected before authentication.
 * Never runs on /api/auth/* (Better Auth is middleware; its own trustedOrigins check applies there).
 */
@Injectable()
export class HttpPolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    const result = checkMutation(
      {
        method: req.method,
        origin: req.headers.origin,
        hasBody: hasBody(req.headers),
        contentType: req.headers['content-type'],
        acceptsMultipart:
          this.reflector.getAllAndOverride<boolean | undefined>(ACCEPTS_MULTIPART, [
            context.getHandler(),
            context.getClass(),
          ]) === true,
      },
      this.config.get('WEB_ORIGIN'),
    );
    if (result === 'CSRF_ORIGIN') throw new AppException('CSRF_ORIGIN', 'Origin not allowed');
    if (result === 'UNSUPPORTED_MEDIA_TYPE') {
      throw new AppException('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    }
    return true;
  }
}
