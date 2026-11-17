import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/index.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process answers. */
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: Postgres (app role) and Redis answer within 1 s each, else 503 UNAVAILABLE (12-infra-ops.md §9). */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    await this.health.ready();
    return { status: 'ok' };
  }
}
