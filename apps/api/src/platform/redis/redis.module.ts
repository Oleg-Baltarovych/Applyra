import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '../config/index.js';

/** DI token for the shared ioredis client (readiness now; Better Auth rate-limit store M0-10; BullMQ R1). */
export const REDIS = Symbol('REDIS');

/**
 * Global. Lazy: no connection at boot (the app and in-process tests start without Redis). No offline queue and one
 * retry per command, so a command fails fast while Redis is down instead of waiting for a reconnect.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const redis = new Redis(config.get('REDIS_URL'), {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        });
        const logger = new Logger('Redis');
        // Without a listener ioredis prints every connection error to stderr. One warn per outage (the first error);
        // reconnect failures after it go to debug until the client is `ready` again. Only the error name/code is
        // logged — the message carries host:port.
        let inOutage = false;
        redis.on('error', (err: Error & { code?: string }) => {
          const fields = { errorName: err.name, errorCode: err.code };
          if (inOutage) logger.debug(fields, 'redis still unavailable');
          else logger.warn(fields, 'redis connection error');
          inOutage = true;
        });
        redis.on('ready', () => {
          if (inOutage) logger.log('redis connection restored');
          inOutage = false;
        });
        return redis;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    // Connected: QUIT lets pending replies finish. Otherwise (lazy, never used, or down) QUIT cannot be sent
    // (no offline queue) — just close the socket and stop reconnecting.
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }
}
