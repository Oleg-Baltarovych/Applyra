// Guards the CLAUDE.md type-safety rules that ESLint enforces: no `any`, no non-null `!`, no `@ts-ignore`.
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const eslint = new ESLint({ cwd: repoRoot });
// lintText needs a path under the repo so the root config applies; the file does not have to exist.
const filePath = path.join(repoRoot, 'apps/digest/src/__probe__.ts');

const ruleIds = async (code: string) => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId);
};

describe('shared ESLint config', () => {
  it('passes clean TypeScript', async () => {
    expect(await ruleIds('export const add = (a: number, b: number): number => a + b;\n')).toEqual(
      [],
    );
  });

  it('rejects any, non-null assertions and @ts-ignore', async () => {
    expect(await ruleIds('export const f = (x: any) => x;\n')).toContain(
      '@typescript-eslint/no-explicit-any',
    );
    expect(await ruleIds('export const f = (x?: string) => x!.length;\n')).toContain(
      '@typescript-eslint/no-non-null-assertion',
    );
    expect(await ruleIds('// @ts-ignore\nexport const n: number = 1;\n')).toContain(
      '@typescript-eslint/ban-ts-comment',
    );
  });

  it('knows Node globals', async () => {
    expect(await ruleIds('export const cwd = process.cwd();\n')).toEqual([]);
  });
});
