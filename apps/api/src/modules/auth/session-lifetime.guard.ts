import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, type UserSession } from '@thallesp/nestjs-better-auth';
import { AppException } from '../../platform/http/index.js';
import type { Auth } from './auth.config.js';
import { AUTH_METADATA } from './auth-metadata.js';
import { isBeyondAbsoluteLifetime } from './session-lifetime.domain.js';

interface SessionRequest {
  session?: UserSession | null;
  user?: UserSession['user'] | null;
}

/**
 * Absolute 30 d session cap (09 §4.2, FR-AUTH-04). Registered right after the Better Auth AuthGuard (auth.module.ts),
 * which has already resolved `request.session`. An over-age session is deleted — so `get-session` returns null
 * afterwards — and the request is treated as anonymous: 401 on private routes, anonymous on @Optional ones.
 */
@Injectable()
export class SessionLifetimeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService<Auth>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(AUTH_METADATA.public, targets)) return true;

    const request = context.switchToHttp().getRequest<SessionRequest>();
    const current = request.session?.session;
    if (!current || !isBeyondAbsoluteLifetime(new Date(current.createdAt), new Date())) return true;

    const authContext = await this.auth.instance.$context;
    await authContext.internalAdapter.deleteSession(current.token);
    request.session = null;
    request.user = null;
    if (this.reflector.getAllAndOverride<boolean>(AUTH_METADATA.optional, targets)) return true;
    throw new AppException('UNAUTHENTICATED', 'Session expired');
  }
}
