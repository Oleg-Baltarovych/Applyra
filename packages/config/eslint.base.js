// @ts-check
// Repo-wide ESLint flat config. Consumed by the root `eslint.config.js`; patterns are relative to the repo root.
// Boundary rules = docs/spec/04-architecture.md §4.1 (1–6); guarded by test/boundaries.test.ts.
import path from 'node:path';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import boundaries from 'eslint-plugin-boundaries';
import { importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const repoRoot = path.resolve(import.meta.dirname, '../..');
/** test/boundaries.test.ts lints a mirror of the repo layout under this prefix. */
const fixture = 'packages/config/test/fixtures/boundaries/';
const withFixture = (/** @type {string} */ glob) => [glob, fixture + glob];

/** Per-package tsconfigs, so path aliases (apps/web `@/*`) resolve for boundaries/import-x. */
const tsProjects = ['apps/*/tsconfig.json', 'packages/*/tsconfig.json', 'e2e/tsconfig.json'].map(
  (p) => path.join(repoRoot, p),
);

const webMswMessage =
  'MSW and fixtures live in tests only (apps/web/test/**, *.test.tsx) — no mock data in src.';
const webFetchMessage =
  'Use the typed client (src/lib/api/client.ts); fetch is allowed only in src/lib/api.';
const webHexMessage = 'No hard-coded hex colours in components: use the design tokens (10 §8).';
/** '#abc' / '#aabbcc' / '#aabbccdd' as a whole string, or inside an arbitrary Tailwind value `[#fff]`. */
const hexColour = String.raw`/(^#|\[#)([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(\]|$)/`;

/** Prisma packages: allowed only in *.repository.ts and platform/prisma (rule 4). */
const prismaPackages = ['@prisma/*', 'prisma'];
/** Prisma wrapper + generated client (M0-08 must emit the generator `output` under ./generated). */
const prismaDir = '**/apps/api/src/platform/prisma/**';
/** The only platform/prisma file services may import: `run(fn)` with an opaque `Tx`, no client surface. */
const prismaTransaction = '**/apps/api/src/platform/prisma/transaction.ts';
/** Composition entry of platform/prisma (PrismaModule, PRISMA token, AppPrisma type) — for composition files only, see the rule 4 exception. */
const prismaDi = '**/apps/api/src/platform/prisma/di.ts';
/** Better Auth's store is the auth module's persistence: its options hand the PRISMA client to prismaAdapter. */
const authOptions = '**/apps/api/src/modules/auth/auth.options.ts';
/** Node core modules doing I/O or touching the process; pure ones (crypto, util, path, url, buffer, assert) are fine. */
const ioCoreModules = [
  'fs',
  'net',
  'http',
  'https',
  'http2',
  'tls',
  'dgram',
  'dns',
  'child_process',
  'cluster',
  'worker_threads',
  'os',
  'process',
  'stream',
  'readline',
  'vm',
  'v8',
  'inspector',
].flatMap((m) => [m, `node:${m}`]); // sub-paths such as fs/promises share the base source

const processEnvMessage =
  'Read configuration through ConfigService; only apps/api/src/platform/config may read process.env.';
const testProcessEnvMessage =
  'Build app config with testEnv() and read runner vars via test/support/runner-env.ts; only it may read process.env in apps/api/test.';

const adapterRouteMessage =
  'Register routes in Nest controllers, not on the HTTP adapter: auth guards and the IDOR gate only see controllers (M0-07b).';
/** app.getHttpAdapter().get/post/…(…) — a route outside Nest controllers (no guards, invisible to the route table). */
const adapterRouteSyntax = {
  selector:
    "CallExpression[callee.property.name=/^(get|post|put|patch|delete|all|options|head|use)$/][callee.object.type='CallExpression'][callee.object.callee.property.name='getHttpAdapter']",
  message: adapterRouteMessage,
};

/**
 * process.env, process['env'], const { env } = process, globalThis.process.env, require('process'), env imports.
 * @param {string} message
 * @param {object[]} [extraSyntax] more no-restricted-syntax entries (one rule key per file: later blocks override it)
 * @returns {import('eslint').Linter.RulesRecord}
 */
const processEnvRules = (message, extraSyntax = []) => ({
  'no-restricted-properties': ['error', { object: 'process', property: 'env', message }],
  'no-restricted-syntax': [
    'error',
    // globalThis.process.env / global.process.env (the rule above matches only a bare `process`).
    { selector: "MemberExpression[object.property.name='process'][property.name='env']", message },
    {
      selector: "CallExpression[callee.name='require'][arguments.0.value=/^(node:)?process$/]",
      message,
    },
    ...extraSyntax,
  ],
  // import { env } / import process (default) / import * as process from 'node:process'.
  'no-restricted-imports': [
    'error',
    {
      paths: ['process', 'node:process'].map((name) => ({
        name,
        importNames: ['env', 'default'],
        message,
      })),
    },
  ],
});

const isRepository = { file: { categories: 'repository' } };
const isService = { file: { categories: 'service' } };
const isDomain = { file: { categories: 'domain' } };
const isController = { file: { categories: 'controller' } };
const toPrisma = [
  { to: { module: { origin: 'external', source: prismaPackages } } },
  { to: { file: { path: prismaDir } } },
];

// Policies are evaluated in order and the LAST matching one wins, so general bans come first and
// narrower exceptions/bans after them. Each message ends with "(rule N)" — asserted by the test.
/** @type {import('eslint-plugin-boundaries').DependenciesPolicy[]} */
const policies = [
  // Rule 1: another module only through its index.ts (same-module imports are allowed).
  {
    from: { element: { type: '*' } },
    disallow: { to: { element: { type: 'api-module' } } },
    message: 'Import another module only via its index.ts (rule 1).',
  },
  {
    from: { element: { type: '*' } },
    allow: { to: { element: { type: 'api-module', fileInternalPath: 'index.ts' } } },
  },
  {
    from: { element: { type: 'api-module' } },
    allow: {
      to: {
        element: { type: 'api-module', captured: { module: '{{ from.element.captured.module }}' } },
      },
    },
  },
  // Rule 4: Prisma (packages, wrapper, generated client) only in *.repository.ts and platform/**.
  {
    from: { element: { type: 'api-*' } },
    disallow: toPrisma,
    message: 'Prisma is used only in *.repository.ts and platform/prisma (rule 4).',
  },
  { from: [isRepository, { file: { path: prismaDir } }], allow: toPrisma },
  { from: { element: { type: 'api-platform' } }, allow: { to: { file: { path: prismaDir } } } },
  { from: isService, allow: { to: { file: { path: prismaTransaction } } } },
  // Composition (M0-08): the app root (app.module.ts, main.ts) imports PrismaModule and the auth options inject
  // PRISMA for Better Auth's prismaAdapter — via di.ts only, never the generated client or internals.
  {
    from: [{ element: { type: 'api-app' } }, { file: { path: authOptions } }],
    allow: { to: { file: { path: prismaDi } } },
  },
  // Rule 2: *.domain.ts is pure — no Nest, Prisma, Node I/O; platform only as types.
  {
    from: isDomain,
    disallow: [
      { to: { module: { origin: 'external', source: ['@nestjs/*', ...prismaPackages] } } },
      { to: { module: { origin: 'core', source: ioCoreModules } } },
      { to: { element: { type: 'api-platform' } }, dependency: { kind: ['value', 'typeof'] } },
    ],
    message:
      '*.domain.ts must stay pure: no @nestjs/*, @prisma/*, Node I/O or platform values (rule 2).',
  },
  // Rule 3: controllers never touch persistence.
  {
    from: isController,
    disallow: [{ to: isRepository }, ...toPrisma],
    message: '*.controller.ts must not import repositories or Prisma (rule 3).',
  },
  // Unit tests (*.spec.ts / *.test.ts next to the code) are exempt from rules 1–4; no-cycle still applies.
  {
    from: { element: { type: 'api-*' }, file: { categories: 'test' } },
    allow: { to: { module: { origin: ['local', 'external', 'core'] } } },
  },
  // Rule 9 (M0-12): a web feature imports another feature only via its index.ts (same feature: anything).
  {
    from: { element: { type: 'web*' } },
    disallow: { to: { element: { type: 'web-feature' } } },
    message: 'Import another web feature only via its index.ts (rule 9).',
  },
  {
    from: { element: { type: 'web*' } },
    allow: { to: { element: { type: 'web-feature', fileInternalPath: 'index.ts' } } },
  },
  {
    from: { element: { type: 'web-feature' } },
    allow: {
      to: {
        element: {
          type: 'web-feature',
          captured: { feature: '{{ from.element.captured.feature }}' },
        },
      },
    },
  },
  // Rule 10 (M0-12): shared web layers (lib, components) never depend on features.
  {
    from: { element: { type: ['web-lib', 'web-components'] } },
    disallow: { to: { element: { type: 'web-feature' } } },
    message: 'apps/web/src/lib and src/components must not import features (rule 10).',
  },
  // Rule 5: web never imports api code; shared code comes from @applyra/contracts only.
  {
    from: { element: { type: 'web*' } },
    disallow: [
      { to: { element: { type: 'api-*' } } },
      { to: { module: { source: '@applyra/api' } } },
    ],
    message: 'apps/web must not import apps/api; share code via @applyra/contracts (rule 5).',
  },
  // Rule 7: platform is the bottom layer (04 §4.2) — it never imports modules.
  {
    from: { element: { type: 'api-platform' } },
    disallow: { to: { element: { type: 'api-module' } } },
    message: 'platform/** must not import modules/** (rule 7).',
  },
  // Rule 8: contracts are standalone — no apps code, no Node core modules.
  {
    from: { element: { type: 'contracts' } },
    disallow: [
      { to: { element: { type: ['api-*', 'web*'] } } },
      { to: { module: { source: '@applyra/*' } } },
      { to: { module: { origin: 'core' } } },
    ],
    message: '@applyra/contracts must not import apps/** or Node core modules (rule 8).',
  },
];

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/playwright-report/**',
      '**/test-results/**',
      // Prisma client generated by `prisma generate` (M0-08; gitignored, carries its own eslint-disable).
      'apps/api/src/platform/prisma/generated/**',
      // Boundary-rule fixtures contain violations on purpose; linted only by test/boundaries.test.ts.
      'packages/config/test/fixtures/**',
      // Template generated by `playwright init-agents` (unused `page`/`expect` by design).
      'e2e/seed.spec.ts',
    ],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: { globals: { ...globals.es2024 } },
  },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ['**/*.{js,mjs,cjs}', 'e2e/**/*.ts', 'packages/config/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: [...withFixture('apps/**/*.{ts,tsx}'), ...withFixture('packages/contracts/src/**/*.ts')],
    plugins: { boundaries, 'import-x': importX },
    settings: {
      'boundaries/root-path': repoRoot,
      'boundaries/elements': [
        { type: 'api-module', pattern: 'apps/api/src/modules/*', capture: ['module'] },
        { type: 'api-platform', pattern: 'apps/api/src/platform' },
        { type: 'api-app', pattern: 'apps/api/src' },
        { type: 'web-feature', pattern: 'apps/web/src/features/*', capture: ['feature'] },
        { type: 'web-lib', pattern: 'apps/web/src/lib' },
        { type: 'web-components', pattern: 'apps/web/src/components' },
        { type: 'web', pattern: 'apps/web' },
        { type: 'contracts', pattern: 'packages/contracts' },
      ],
      // Integration tests live in apps/api/test/** (outside src): no element, so rules 1–4 do not apply.
      'boundaries/files': [
        { pattern: '**/*.domain.ts', category: 'domain' },
        { pattern: '**/*.controller.ts', category: 'controller' },
        { pattern: '**/*.repository.ts', category: 'repository' },
        { pattern: '**/*.service.ts', category: 'service' },
        { pattern: '**/*.{spec,test}.{ts,tsx}', category: 'test' },
      ],
      // import-x must parse .ts dependencies itself, otherwise no-cycle silently sees no edges.
      'import-x/extensions': ['.ts', '.tsx', '.js'],
      'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: tsProjects,
          noWarnOnMultipleProjects: true,
        }),
      ],
      // boundaries resolves via eslint-module-utils, which reads only the legacy key — without it local imports go unresolved.
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: tsProjects, noWarnOnMultipleProjects: true },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        { default: 'allow', checkAllOrigins: true, checkInternals: true, policies },
      ],
    },
  },
  // Nest modules are decorated classes with no members (or only a static forRoot).
  {
    files: withFixture('apps/api/**/*.ts'),
    rules: { '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }] },
  },
  // Config (12-infra-ops.md §7): only platform/config reads the process environment; the rest injects ConfigService.
  {
    files: withFixture('apps/api/src/**/*.ts'),
    ignores: withFixture('apps/api/src/platform/config/**'),
    rules: processEnvRules(processEnvMessage, [adapterRouteSyntax]),
  },
  {
    files: withFixture('apps/api/src/platform/config/**/*.ts'),
    rules: { 'no-restricted-syntax': ['error', adapterRouteSyntax] },
  },
  // Tests (M0-07a): app config only via testEnv(); runner vars (VITEST_POOL_ID) only via runner-env.ts.
  // apps/api/*.config.ts (vitest, later prisma) live outside test/ and are not covered.
  {
    files: withFixture('apps/api/test/**/*.ts'),
    ignores: withFixture('apps/api/test/support/runner-env.ts'),
    rules: processEnvRules(testProcessEnvMessage),
  },
  // apps/web (M0-12, 10 §6.3, §8): browser globals, React hooks rules, typed client only, tokens only, no MSW in src.
  {
    files: withFixture('apps/web/{src,test}/**/*.{ts,tsx}'),
    languageOptions: { globals: { ...globals.browser } },
  },
  // Own block: spreading the plugin's flat config would let its own keys (e.g. a future `files`) override ours.
  {
    files: withFixture('apps/web/{src,test}/**/*.{ts,tsx}'),
    plugins: reactHooks.configs.flat.recommended.plugins,
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      // Recommended has it as warn; a missing dependency is a real bug (stale closure) — fail lint.
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  { files: ['apps/web/public/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: withFixture('apps/web/src/**/*.{ts,tsx}'),
    ignores: withFixture('apps/web/src/lib/api/**'),
    rules: { 'no-restricted-globals': ['error', { name: 'fetch', message: webFetchMessage }] },
  },
  {
    files: withFixture('apps/web/src/**/*.{ts,tsx}'),
    ignores: withFixture('apps/web/src/**/*.test.{ts,tsx}'),
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['msw', 'msw/*', '**/test/**'], message: webMswMessage }] },
      ],
    },
  },
  {
    files: withFixture('apps/web/src/**/*.tsx'),
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${hexColour}]`, message: webHexMessage },
        { selector: `TemplateElement[value.raw=${hexColour}]`, message: webHexMessage },
      ],
    },
  },
  // Rule 6: no import cycles between (or inside) backend modules.
  {
    files: withFixture('apps/api/src/modules/**/*.ts'),
    rules: { 'import-x/no-cycle': 'error' },
  },
  prettier,
);
