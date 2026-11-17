import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import {
  AuthModule,
  type AuthModuleAsyncOptions,
  authOptionsFromConfig,
} from './modules/auth/index.js';
import { HealthModule } from './modules/health/index.js';
import { ConfigModule, type Env } from './platform/config/index.js';
import { HttpModule } from './platform/http/index.js';
import { LoggingModule, type LoggingOverride } from './platform/logging/index.js';
import { PrismaModule } from './platform/prisma/di.js';
import { RedisModule } from './platform/redis/index.js';

export interface AppModuleOptions {
  /** Validated environment (loadEnv() in main.ts); exposed app-wide as ConfigService. */
  env: Env;
  /** Override for tests only; defaults to the env-driven config. */
  auth?: AuthModuleAsyncOptions;
  /** Override for tests only: capture stream + level (NODE_ENV=test logs nothing by default). */
  logging?: LoggingOverride;
}

@Module({})
export class AppModule {
  static forRoot({ env, auth = authOptionsFromConfig, logging }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        // First: its pino-http middleware must also wrap /api/auth/* (module middleware runs in import order).
        LoggingModule.forRoot(logging),
        PrismaModule,
        RedisModule,
        // Before AuthModule: global guards run in registration order, so CSRF_ORIGIN (403) beats 401.
        HttpModule,
        AuthModule.forRootAsync(auth),
        HealthModule,
      ],
      providers: [
        // nestjs-zod: validate createZodDto bodies/query/params; @ZodResponse serializes responses.
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    };
  }
}
