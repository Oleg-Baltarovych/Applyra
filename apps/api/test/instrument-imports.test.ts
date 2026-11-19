// M0-15: src/instrument.ts runs Sentry.init before the app (`node --import`). In ESM, a package loaded before init
// escapes Sentry's instrumentation, so instrument.ts's static import graph may only reach @sentry/nestjs, zod and
// node built-ins. Static scan of the relative imports (type-only imports are erased and ignored).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(import.meta.dirname, '../src');
const ALLOWED_PACKAGES = new Set(['@sentry/nestjs', 'zod']);
const IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

function importGraph(entry: string): { files: string[]; packages: Set<string> } {
  const files: string[] = [];
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || files.includes(file)) continue;
    files.push(file);
    for (const [, specifier = ''] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      if (specifier.startsWith('.')) {
        queue.push(path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts')));
      } else if (!specifier.startsWith('node:')) {
        packages.add(specifier);
      }
    }
  }
  return { files, packages };
}

describe('instrument.ts import graph', () => {
  it('reaches only @sentry/nestjs, zod and node built-ins (no pino, @nestjs/*, express)', () => {
    const { files, packages } = importGraph(path.join(srcDir, 'instrument.ts'));

    // Self-check: the scan follows relative imports down to the shared redaction rules.
    expect(files.map((f) => path.relative(srcDir, f).replaceAll('\\', '/'))).toEqual(
      expect.arrayContaining(['platform/sentry/scrub.ts', 'platform/logging/redact-rules.ts']),
    );
    expect([...packages].filter((name) => !ALLOWED_PACKAGES.has(name))).toEqual([]);
  });
});
