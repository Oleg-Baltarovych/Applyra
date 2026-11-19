// Sentry settings for src/instrument.ts, which runs (`node --import`) before the app and before loadEnv: Sentry
// must be initialised before @nestjs/* and express are loaded to instrument them (ESM). Imports zod only.
import { z } from 'zod';
import { nodeEnv, sentryDsn } from './env.schema.js';

export interface SentryEnv {
  dsn: string;
  environment: z.output<typeof nodeEnv>;
}

const schema = z.object({ NODE_ENV: nodeEnv, SENTRY_DSN: sentryDsn });

/**
 * DSN + environment when Sentry is enabled; undefined when SENTRY_DSN is unset/empty (the local default, 12 §1) or
 * the values are invalid — loadEnv in main.ts then reports them and exits, so nothing is printed here.
 */
export function readSentryEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): SentryEnv | undefined {
  const result = schema.safeParse(source);
  if (!result.success || result.data.SENTRY_DSN === undefined) return undefined;
  return { dsn: result.data.SENTRY_DSN, environment: result.data.NODE_ENV };
}
