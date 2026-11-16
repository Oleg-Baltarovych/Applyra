// ADR 022: `cp .env.example .env` must be enough to start the api locally. This guards the example file against
// drifting from the env schema (a renamed/added required variable would otherwise only surface at someone's first run).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv as parseDotenv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/platform/config/index.js';

const examplePath = fileURLToPath(new URL('../../../.env.example', import.meta.url));
const example = parseDotenv(readFileSync(examplePath, 'utf8'));

describe('.env.example', () => {
  it('passes the api env schema as is', () => {
    const result = parseEnv(example);

    expect(result.success ? [] : result.errors).toEqual([]);
  });

  it('enables demo sign-in and leaves the optional integrations unset', () => {
    const result = parseEnv(example);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.env.DEMO_ENABLED).toBe(true);
    expect(result.env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(result.env.SENTRY_DSN).toBeUndefined();
  });

  it('is rejected as a production config (placeholders must never reach a real host)', () => {
    const result = parseEnv({ ...example, NODE_ENV: 'production' });

    expect(result.success).toBe(false);
  });
});
