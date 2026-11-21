// @ts-check
// Repo-wide ESLint flat config, consumed by the root `eslint.config.js` (patterns are relative to the repo root).
// Not type-aware on purpose (fast, no build needed). Guarded by test/eslint-config.test.ts.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.state/**'] },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    // Everything in this repo runs on Node (the digest is a CLI run by GitHub Actions).
    languageOptions: { globals: { ...globals.es2024, ...globals.node } },
  },
  js.configs.recommended,
  tseslint.configs.strict,
  prettier,
);
