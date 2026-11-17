// Drift guard (M0-07a): Testcontainers must run the same Postgres / Valkey images as local compose, so a bump in
// one place without the other fails here instead of tests silently running against a different server version.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { POSTGRES_IMAGE, VALKEY_IMAGE } from './support/images.js';

const composePath = fileURLToPath(new URL('../../../infra/compose/compose.yml', import.meta.url));
const compose = readFileSync(composePath, 'utf8');

/** `image:` of a top-level service (`  <name>:` … first `    image: <ref>` below it). No YAML dependency on purpose. */
function serviceImage(service: string): string | undefined {
  const match = new RegExp(String.raw`^  ${service}:\s*$[\s\S]*?^    image:\s*(\S+)\s*$`, 'm').exec(
    compose,
  );
  return match?.[1];
}

describe('test container images', () => {
  it('Postgres equals the compose `postgres` service image', () => {
    expect(serviceImage('postgres')).toBe(POSTGRES_IMAGE);
  });

  it('Valkey equals the compose `redis` service image', () => {
    expect(serviceImage('redis')).toBe(VALKEY_IMAGE);
  });
});
