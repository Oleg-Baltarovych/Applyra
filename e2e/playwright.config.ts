import { defineConfig } from '@playwright/test';

// Minimal config so `playwright test` and the playwright-test MCP server resolve this package.
// baseURL, projects, retries and webServer arrive with the e2e harness (M3-23).
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
});
