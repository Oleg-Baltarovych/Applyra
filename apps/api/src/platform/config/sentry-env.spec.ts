import { describe, expect, it } from 'vitest';
import { readSentryEnv } from './sentry-env.js';

const DSN = 'https://public@o1.ingest.de.sentry.io/1';

describe('readSentryEnv (instrument.ts, before the app and loadEnv)', () => {
  it('is undefined without SENTRY_DSN or with an empty one: Sentry stays off', () => {
    expect(readSentryEnv({ NODE_ENV: 'production' })).toBeUndefined();
    expect(readSentryEnv({ NODE_ENV: 'production', SENTRY_DSN: '' })).toBeUndefined();
  });

  it('returns the DSN and NODE_ENV as the Sentry environment', () => {
    expect(readSentryEnv({ NODE_ENV: 'production', SENTRY_DSN: DSN })).toEqual({
      dsn: DSN,
      environment: 'production',
    });
  });

  it('is undefined for an invalid DSN or NODE_ENV (loadEnv in main.ts reports it and exits)', () => {
    expect(readSentryEnv({ NODE_ENV: 'production', SENTRY_DSN: 'not a url' })).toBeUndefined();
    expect(readSentryEnv({ NODE_ENV: 'prod', SENTRY_DSN: DSN })).toBeUndefined();
  });
});
