import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../platform/http/index.js';
import { HealthRepository } from './health.repository.js';

export const READY_TIMEOUT_MS = 1000;

/**
 * Rejects after `ms`. The probe itself is not cancelled: a hung query/PING settles later on its own (the pg pool /
 * ioredis time out the socket) and its late result is ignored — it is already observed by Promise.race, so no
 * unhandled rejection.
 */
const withTimeout = (probe: Promise<void>, ms: number): Promise<void> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([probe, timeout]).finally(() => clearTimeout(timer));
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly repository: HealthRepository) {}

  /** Both probes in parallel, 1 s each. Failures are logged by name; the client only sees 503 UNAVAILABLE. */
  async ready(): Promise<void> {
    const probes = {
      postgres: () => this.repository.pingDatabase(),
      redis: () => this.repository.pingRedis(),
    };
    const results = await Promise.allSettled(
      Object.values(probes).map((probe) => withTimeout(probe(), READY_TIMEOUT_MS)),
    );
    const failed = Object.keys(probes).filter((_, i) => results[i]?.status === 'rejected');
    if (failed.length === 0) return;
    // Probe name + error name/code only: messages carry host:port and connection details.
    const errors = Object.keys(probes).flatMap((probe, i) => {
      const r = results[i];
      if (r?.status !== 'rejected') return [];
      const reason: unknown = r.reason;
      const err = reason instanceof Error ? (reason as Error & { code?: unknown }) : undefined;
      return [
        {
          probe,
          errorName: err?.name ?? typeof reason,
          errorCode: typeof err?.code === 'string' ? err.code : undefined,
        },
      ];
    });
    this.logger.warn({ failed, errors }, 'readiness check failed');
    throw new AppException('UNAVAILABLE', 'Not ready');
  }
}
