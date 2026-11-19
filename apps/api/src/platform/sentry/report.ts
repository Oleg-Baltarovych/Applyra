import * as Sentry from '@sentry/nestjs';

export interface ErrorReportContext {
  requestId: string;
  /** Signed-in user, if any: Sentry keeps the id only (09 §12). */
  userId?: string;
}

/**
 * Sends an unexpected error to Sentry. A no-op without a client: when SENTRY_DSN is unset, instrument.ts never
 * calls Sentry.init, so nothing is buffered or sent.
 */
export function reportError(err: unknown, { requestId, userId }: ErrorReportContext): void {
  Sentry.captureException(err, {
    tags: { requestId },
    ...(userId === undefined ? {} : { user: { id: userId } }),
  });
}
