// Sentry SDK options for the api (12-infra-ops.md §9, 09-security-privacy.md §12): errors only, no PII.
// @sentry/nestjs 11 has no `sendDefaultPii`; its successor `dataCollection` defaults to collecting user info,
// cookies, headers, bodies and query params, so every category is switched off or allowlisted here, and
// beforeSend scrubs whatever still reaches an event (explicit context, exception messages, breadcrumbs).
import type { NodeOptions } from '@sentry/nestjs';
import type { SentryEnv } from '../config/sentry-env.js';
import { HEADER_ALLOWLIST, scrubBreadcrumb, scrubEvent } from './scrub.js';

export function sentryOptions({ dsn, environment }: SentryEnv): NodeOptions {
  return {
    dsn,
    environment,
    // Traces are OpenTelemetry's job (R2); Sentry only receives errors in R0/R1.
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
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    // Defence in depth on top of tracesSampleRate 0. 'static' lifecycle: under the SDK 11 default ('stream')
    // beforeSendTransaction is ignored (with a startup warning).
    traceLifecycle: 'static',
    beforeSendTransaction: () => null,
  };
}
