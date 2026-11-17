import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { type AppPrisma, PRISMA } from '../../platform/prisma/index.js';
import { REDIS } from '../../platform/redis/index.js';

/** Dependency probes for /health/ready. */
@Injectable()
export class HealthRepository {
  constructor(
    @Inject(PRISMA) private readonly prisma: AppPrisma,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** `SELECT 1` as the app role (raw queries bypass the user-scope extension by design). */
  async pingDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async pingRedis(): Promise<void> {
    // Lazy client without an offline queue: the first command after boot needs an explicit connect.
    if (this.redis.status === 'wait') await this.redis.connect();
    await this.redis.ping();
  }
}
