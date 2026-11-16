import { configDefaults, defineConfig } from 'vitest/config';

// No SWC plugin needed: Vite 8's Oxc transformer reads experimentalDecorators/emitDecoratorMetadata from
// tsconfig.json and emits `design:paramtypes`, which Nest DI and nestjs-zod's pipe rely on (M0-02).
export default defineConfig({
  test: {
    // Default run = in-process tests (no Docker). Testcontainers tests live in test/integration/** and run
    // only via `test:integration` (vitest.integration.config.ts; CI job `integration`, M0-07a).
    include: ['src/**/*.{spec,test}.ts', 'test/**/*.{spec,test}.ts'],
    exclude: [...configDefaults.exclude, 'test/integration/**'],
    // Domain coverage gate (11-testing.md §8): enabled by `pnpm test` (`--coverage`), so local = CI.
    // `include` also reports domain files no test imports (0%), and `perFile` stops one well-tested
    // file from averaging an untested one above the threshold.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.domain.ts'],
      reporter: ['text'],
      thresholds: { perFile: true, lines: 90, branches: 90 },
    },
  },
});
