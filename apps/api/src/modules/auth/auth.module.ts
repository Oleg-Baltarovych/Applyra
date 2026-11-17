import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule as BetterAuthModule, AuthGuard } from '@thallesp/nestjs-better-auth';
import { JSON_BODY_LIMIT_BYTES } from '../../platform/http/index.js';
import { type AuthConfig, createAuth } from './auth.config.js';
import { SessionLifetimeGuard } from './session-lifetime.guard.js';

export interface AuthModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: FactoryProvider['inject'];
  /** Receives the `inject` tokens in order, e.g. (config: ConfigService) => AuthConfig. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same contract as Nest's FactoryProvider.useFactory; deps are typed by the caller's factory
  useFactory: (...deps: any[]) => AuthConfig | Promise<AuthConfig>;
}

/**
 * Mounts Better Auth on /api/auth/* and registers the global guards: every route is private unless marked @Public().
 * Requires NestFactory.create(..., { bodyParser: false }); the package re-adds the JSON parser (1 MB) for non-auth
 * routes. Config is resolved through DI so the Zod config service (M0-04), the Prisma adapter (M0-08) and the Redis
 * rate-limit store (M0-10) plug in via `imports`/`inject`.
 */
@Module({})
export class AuthModule {
  static forRootAsync(options: AuthModuleAsyncOptions): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        BetterAuthModule.forRootAsync({
          imports: options.imports ?? [],
          inject: options.inject ?? [],
          useFactory: async (...deps: unknown[]) => ({
            auth: createAuth(await options.useFactory(...deps)),
            // CORS is owned by platform/http configureHttp (exact WEB_ORIGIN, PATCH, Idempotency-Key, max-age).
            disableTrustedOriginsCors: true,
            // Parsers the adapter adds for non-/api/auth routes: JSON only, 1 MB (06-api.md §5). No urlencoded:
            // closes the HTML-form CSRF route on top of the Origin check.
            bodyParser: { json: { limit: JSON_BODY_LIMIT_BYTES }, urlencoded: { enabled: false } },
          }),
          // Registered below instead, so the order is ours: global guards run in provider order.
          disableGlobalAuthGuard: true,
        }),
      ],
      providers: [
        // 1. resolves request.session, honours @Public/@Optional/@Roles; 2. absolute 30 d cap on that session.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: SessionLifetimeGuard },
      ],
    };
  }
}
