import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { HttpPolicyGuard } from './http-policy.guard.js';

/**
 * Global error filter + the CSRF/content-type guard. Import it BEFORE AuthModule: Nest runs global guards in
 * registration order, so CSRF_ORIGIN (403) wins over UNAUTHENTICATED (401).
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: HttpPolicyGuard },
  ],
})
export class HttpModule {}
