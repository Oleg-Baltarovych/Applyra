import { defineConfig } from 'vitest/config';

// Integration tests (Testcontainers: Postgres 18, Valkey 9) — 11-testing.md §3, M0-07a. One container set per run
// (globalSetup: containers + template DB), a database + Redis prefix per worker re-created per test file
// (setupFiles). The default vitest.config.ts excludes this folder.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.{spec,test}.ts'],
    globalSetup: ['test/integration/support/global-setup.ts'],
    setupFiles: ['test/integration/support/worker-setup.ts'],
    // Per-file isolation: setupFiles (re-clone + flush) run once per test file.
    isolate: true,
    // Bounds the number of worker databases; CI runner = 4 vCPU.
    maxWorkers: 4,
    hookTimeout: 60_000, // clone + (later) Nest boot
    testTimeout: 15_000,
    teardownTimeout: 30_000,
  },
});
