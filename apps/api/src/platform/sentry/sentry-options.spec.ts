import type { ErrorEvent } from '@sentry/nestjs';
import { describe, expect, it } from 'vitest';
import { HEADER_ALLOWLIST } from './scrub.js';
import { sentryOptions } from './sentry-options.js';

const env = { dsn: 'https://public@o1.ingest.de.sentry.io/1', environment: 'production' } as const;

describe('sentryOptions (12 §9: errors only, no PII)', () => {
  it('collects no default PII and no traces (SDK 11: dataCollection replaces sendDefaultPii)', () => {
    expect(sentryOptions(env)).toMatchObject({
      dsn: env.dsn,
      environment: 'production',
      tracesSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { allow: [...HEADER_ALLOWLIST] }, response: false },
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
      },
    });
  });

  it('scrubs every error event in beforeSend', async () => {
    const { beforeSend } = sentryOptions(env);
    const event: ErrorEvent = {
      type: undefined,
      user: { id: 'u-1', email: 'alice@example.com' },
      request: { url: 'https://api.test/x?token=t', cookies: { a: 'b' } },
    };
    expect(await beforeSend?.(event, {})).toEqual({
      type: undefined,
      user: { id: 'u-1' },
      request: { url: 'https://api.test/x' },
    });
  });

  it('drops non-http breadcrumbs and every transaction', async () => {
    const { beforeBreadcrumb, beforeSendTransaction, traceLifecycle } = sentryOptions(env);
    expect(beforeBreadcrumb?.({ category: 'console', message: 'x' })).toBeNull();
    // 'static': under the default 'stream' lifecycle the SDK ignores beforeSendTransaction (and warns).
    expect(traceLifecycle).toBe('static');
    expect(await beforeSendTransaction?.({ type: 'transaction' }, {})).toBeNull();
  });
});
