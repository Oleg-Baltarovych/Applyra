import { defineConfig } from 'vitest/config';

// No SWC plugin needed: Vite 8's Oxc transformer reads experimentalDecorators/emitDecoratorMetadata from
// tsconfig.json and emits `design:paramtypes`, which Nest DI and nestjs-zod's pipe rely on (M0-02).
export default defineConfig({
  test: {
    include: ['src/**/*.{spec,test}.ts', 'test/**/*.{spec,test}.ts'],
  },
});
