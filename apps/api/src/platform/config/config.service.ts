import { Inject, Injectable } from '@nestjs/common';
import type { Env } from './env.schema.js';

/** DI token for the parsed environment; provided by ConfigModule.forRoot. */
export const ENV = Symbol('ENV');

/** Typed, read-only access to the validated environment. The only way code reads configuration. */
@Injectable()
export class ConfigService {
  constructor(@Inject(ENV) private readonly env: Readonly<Env>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }
}
