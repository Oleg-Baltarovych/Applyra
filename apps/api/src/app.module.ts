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
import { PrismaModule } from './platform/prisma/di.js';

export interface AppModuleOptions {
  /** Validated environment (loadEnv() in main.ts); exposed app-wide as ConfigService. */
  env: Env;
  /** Override for tests only; defaults to the env-driven config. */
  auth?: AuthModuleAsyncOptions;
}

@Module({})
export class AppModule {
  static forRoot({ env, auth = authOptionsFromConfig }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        PrismaModule,
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
