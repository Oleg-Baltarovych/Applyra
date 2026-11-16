import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AuthModule, type AuthModuleAsyncOptions } from './modules/auth/index.js';
import { HealthModule } from './modules/health/index.js';

export interface AppConfig {
  auth: AuthModuleAsyncOptions;
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [AuthModule.forRootAsync(config.auth), HealthModule],
      providers: [
        // nestjs-zod: validate createZodDto bodies/query/params; @ZodResponse serializes responses.
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    };
  }
}
