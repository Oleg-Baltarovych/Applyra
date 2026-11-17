// Test-only controller for the IDOR gate self-tests (route-table.test.ts, idor-gate.test.ts). Never in AppModule.
import { Controller, Get, Post } from '@nestjs/common';
import { OptionalAuth } from '@thallesp/nestjs-better-auth';
import { Public } from '../../src/modules/auth/index.js';
import { IdorExempt } from '../../src/platform/http/index.js';

@Controller('probe/')
export class IdorProbeController {
  @Public()
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  /** Private, no fixture: the coverage gate must name it. */
  @Get(':id')
  byId(): { ok: true } {
    return { ok: true };
  }

  @IdorExempt('probe: own data only')
  @Post(['me', 'me/alias/'])
  me(): { ok: true } {
    return { ok: true };
  }

  @OptionalAuth()
  @Get('optional/list')
  maybe(): { ok: true } {
    return { ok: true };
  }
}
