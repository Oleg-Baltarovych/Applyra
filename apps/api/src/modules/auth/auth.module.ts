import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { type AuthConfig, createAuth } from './auth.config.js';

export interface AuthModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: FactoryProvider['inject'];
  /** Receives the `inject` tokens in order, e.g. (config: ConfigService) => AuthConfig. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same contract as Nest's FactoryProvider.useFactory; deps are typed by the caller's factory
  useFactory: (...deps: any[]) => AuthConfig | Promise<AuthConfig>;
}

/**
 * Mounts Better Auth on /api/auth/* and registers its global AuthGuard: every route is private
 * unless marked @Public(). Requires NestFactory.create(..., { bodyParser: false }); the package
 * re-adds JSON/urlencoded parsers for non-auth routes.
 * Config is resolved through DI so the Zod config service (M0-04) and the Prisma adapter (M0-08)
 * plug in via `imports`/`inject`.
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
          }),
        }),
      ],
    };
  }
}
