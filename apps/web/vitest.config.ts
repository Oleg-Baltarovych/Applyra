import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Tests never read the developer's env file: fixed public values only.
    envDir: false,
    test: {
      environment: 'jsdom',
      // Node 25+ ships a global localStorage that warns without --localstorage-file; tests use jsdom's instead.
      execArgv: ['--no-experimental-webstorage'],
      include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
      setupFiles: ['test/setup.ts'],
      env: {
        VITE_API_URL: 'http://localhost:3000/api/v1',
        VITE_AUTH_GOOGLE_ENABLED: 'true',
      },
    },
  }),
);
