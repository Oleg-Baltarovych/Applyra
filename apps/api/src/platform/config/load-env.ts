// The only place that reads the process environment (ESLint: no-restricted-properties outside platform/config).
import { type Env, parseEnv } from './env.schema.js';

/**
 * Parses the environment once at bootstrap. On failure prints every problem (names and reasons, never
 * values) to stderr and exits with code 1 — the process must not start half-configured.
 */
export function loadEnv(source: Readonly<Record<string, string | undefined>> = process.env): Env {
  const result = parseEnv(source);
  if (result.success) return result.env;
  const lines = result.errors.map((error) => `  - ${error}`).join('\n');
  // stderr directly: the logger (pino, M0-09) is configured from this very config.
  process.stderr.write(`Invalid environment configuration (see .env.example):\n${lines}\n`);
  return process.exit(1);
}
