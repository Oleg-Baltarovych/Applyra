import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/index.js';

// Liveness only; /health/ready (PG, Redis) arrives in M0-09.
@Controller('health')
export class HealthController {
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
