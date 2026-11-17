// Guards the module-boundary rules of docs/spec/04-architecture.md §4.1 (rules 1–8) and the
// process.env ban outside apps/api/src/platform/config (12-infra-ops.md §7) and, in apps/api/test, outside
// test/support/runner-env.ts (M0-07a).
// Lints a fixture tree that mirrors the repo layout with the real root ESLint config and asserts
// the exact findings per file: each boundaries message ends with "(rule N)".
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const fixtureRoot = path.join(import.meta.dirname, 'fixtures/boundaries');
const api = 'apps/api/src';

type Finding = { ruleId: string | null; message: string };
let findings: Map<string, Finding[]>;

beforeAll(async () => {
  // ignore: false — the fixture folder is in the config's `ignores` so a normal `pnpm lint` stays green.
  const eslint = new ESLint({ cwd: repoRoot, ignore: false });
  const results = await eslint.lintFiles([fixtureRoot]);
  findings = new Map(
    results.map((r) => [
      path.relative(fixtureRoot, r.filePath).split(path.sep).join('/'),
      r.messages.map(({ ruleId, message }) => ({ ruleId, message })),
    ]),
  );
}, 60_000);

const boundary = (rule: number) => ({
  ruleId: 'boundaries/dependencies',
  message: expect.stringContaining(`(rule ${rule})`),
});
const processEnv = (ruleId: string) => ({
  ruleId,
  message: expect.stringContaining('only apps/api/src/platform/config may read process.env'),
});
const adapterRoute = {
  ruleId: 'no-restricted-syntax',
  message: expect.stringContaining('not on the HTTP adapter'),
};
const testProcessEnv = (ruleId: string) => ({
  ruleId,
  message: expect.stringContaining('only it may read process.env in apps/api/test'),
});
const cycle = { ruleId: 'import-x/no-cycle', message: expect.stringContaining('cycle') };

const clean = [
  `${api}/main.ts`,
  `${api}/app.module.ts`, // composition root → platform/prisma/di.ts (rule 4 exception)
  `${api}/modules/auth/auth.options.ts`, // Better Auth store → platform/prisma/di.ts (rule 4 exception)
  `${api}/platform/prisma/di.ts`,
  `${api}/platform/clock.ts`,
  `${api}/platform/health.ts`, // platform → platform/prisma
  `${api}/platform/prisma/prisma.service.ts`, // platform/prisma → @prisma/client
  `${api}/platform/prisma/transaction.ts`,
  `${api}/platform/config/load-env.ts`, // the only reader of process.env
  `${api}/platform/prisma/generated/client.ts`,
  `${api}/modules/alpha/index.ts`,
  `${api}/modules/alpha/alpha.service.ts`, // → transaction.ts, own repository, @applyra/contracts
  `${api}/modules/alpha/alpha.repository.ts`, // → @prisma/client
  `${api}/modules/alpha/alpha.domain.ts`, // → node:crypto, platform types, @applyra/contracts
  `${api}/modules/alpha/alpha.controller.ts`,
  `${api}/modules/beta/beta.service.ts`, // → another module's index.ts
  `${api}/modules/beta/beta.spec.ts`, // unit test → another module's internal file (exempt)
  'apps/api/test/support/runner-env.ts', // the only reader of process.env in apps/api/test
  'apps/web/src/contracts-ok.ts',
  'packages/contracts/src/index.ts',
];

const violations: [file: string, expected: object[]][] = [
  [`${api}/modules/beta/deep-import.ts`, [boundary(1)]],
  [`${api}/modules/beta/reexport.ts`, [boundary(1)]], // export … from form
  [`${api}/modules/beta/nest.domain.ts`, [boundary(2)]], // only rule 2 bans @nestjs/*
  [`${api}/modules/beta/prisma.domain.ts`, [boundary(2)]], // rule 4 also matches; rule 2 is last
  [`${api}/modules/beta/io.domain.ts`, [boundary(2)]], // node:fs/promises
  [`${api}/modules/beta/os.domain.ts`, [boundary(2)]], // bare `os`
  [`${api}/modules/beta/platform-value.domain.ts`, [boundary(2)]],
  [`${api}/modules/alpha/repo.controller.ts`, [boundary(3)]], // only rule 3 bans repositories
  [`${api}/modules/alpha/prisma.controller.ts`, [boundary(3)]],
  [`${api}/modules/alpha/wrapper.controller.ts`, [boundary(3)]], // → platform/prisma/prisma.service
  [`${api}/modules/beta/transaction.controller.ts`, [boundary(3)]], // exception is for services only
  [`${api}/modules/beta/prisma-client.service.ts`, [boundary(4)]],
  [`${api}/modules/beta/prisma-wrapper.service.ts`, [boundary(4)]], // only transaction.ts is allowed
  [`${api}/modules/beta/generated-client.service.ts`, [boundary(4)]],
  [`${api}/modules/beta/prisma-di.service.ts`, [boundary(4)]], // di.ts exception is not for services
  [`${api}/generated-leak.ts`, [boundary(4)]], // app root: di.ts only, never the generated client
  ['apps/web/src/api-relative.ts', [boundary(5)]],
  ['apps/web/src/api-package.ts', [boundary(5)]],
  [`${api}/modules/gamma/gamma.service.ts`, [cycle]],
  [`${api}/modules/delta/delta.service.ts`, [cycle]],
  [`${api}/modules/gamma/index.ts`, [cycle]], // re-export edge of the same cycle
  [`${api}/modules/delta/index.ts`, [cycle]],
  [`${api}/platform/module-leak.ts`, [boundary(7)]],
  ['packages/contracts/src/api-leak.ts', [boundary(8)]],
  ['packages/contracts/src/core.ts', [boundary(8)]],
  [`${api}/modules/beta/process-env.ts`, [processEnv('no-restricted-properties')]],
  [`${api}/platform/process-env-destructure.ts`, [processEnv('no-restricted-properties')]],
  [`${api}/process-env-import.ts`, [processEnv('no-restricted-imports')]],
  [`${api}/modules/beta/process-env-global.ts`, [processEnv('no-restricted-syntax')]],
  [`${api}/modules/beta/process-env-computed.ts`, [processEnv('no-restricted-properties')]],
  [`${api}/platform/process-env-default-import.ts`, [processEnv('no-restricted-imports')]],
  [`${api}/platform/process-env-namespace-import.ts`, [processEnv('no-restricted-imports')]],
  [`${api}/platform/adapter-route.ts`, [adapterRoute]],
  ['apps/api/test/integration/process-env.ts', [testProcessEnv('no-restricted-properties')]],
  [
    `${api}/process-env-require.ts`,
    [
      { ruleId: '@typescript-eslint/no-require-imports', message: expect.any(String) },
      processEnv('no-restricted-syntax'),
    ],
  ],
];

describe('boundaries fixtures', () => {
  it('every fixture file is covered by this test', () => {
    const all = readdirSync(fixtureRoot, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts'))
      .map((f) => f.split(path.sep).join('/'))
      .sort();
    expect(all).toEqual([...clean, ...violations.map(([f]) => f)].sort());
  });

  it.each(clean)('allowed: %s', (file) => {
    expect(findings.get(file)).toEqual([]);
  });

  it.each(violations)('violation: %s', (file, expected) => {
    expect(findings.get(file)).toEqual(expected);
  });
});
