import * as Sentry from '@sentry/nestjs';
import { describe, expect, it } from 'vitest';
import { reportError } from './report.js';

describe('reportError', () => {
  it('is a silent no-op when Sentry was never initialised (no SENTRY_DSN)', () => {
    expect(Sentry.getClient()).toBeUndefined();
    expect(() => reportError(new Error('boom'), { requestId: 'r-1', userId: 'u-1' })).not.toThrow();
  });
});
