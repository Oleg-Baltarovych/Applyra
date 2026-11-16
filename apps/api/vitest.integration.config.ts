import { defineConfig } from 'vitest/config';

// Integration tests (Testcontainers: Postgres 18, Valkey 9) — 11-testing.md §3. M0-07a adds globalSetup
// (containers + template DB) here; the default vitest.config.ts excludes this folder.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.{spec,test}.ts'],
  },
});
