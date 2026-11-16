import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigService, ENV } from './config.service.js';
import type { Env } from './env.schema.js';

/** Global: every module can inject ConfigService. `env` comes from loadEnv() (main.ts) or a test. */
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: ENV, useValue: env }, ConfigService],
      exports: [ConfigService],
    };
  }
}
