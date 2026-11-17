// Drift guard: the ErrorCode enum + errorStatus in @applyra/contracts must equal the 06-api.md §3.1 table
// ("catalogue = enum"; a new code goes into the spec first). Lives here because contracts has no Node APIs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ErrorCode, errorStatus } from '@applyra/contracts';
import { describe, expect, it } from 'vitest';

const spec = readFileSync(
  path.resolve(import.meta.dirname, '../../../docs/spec/06-api.md'),
  'utf8',
);

function catalogue(): Record<string, number> {
  const start = spec.indexOf('### 3.1.');
  const end = spec.indexOf('\n## 4.', start);
  expect(start).toBeGreaterThan(-1);
  const rows = spec.slice(start, end).matchAll(/^\| (\d{3}) \| `([A-Z_]+)` \|/gm);
  return Object.fromEntries([...rows].map(([, status, code]) => [code, Number(status)]));
}

describe('error code catalogue (06-api.md §3.1)', () => {
  it('has the same codes and statuses as the spec table', () => {
    const table = catalogue();
    expect(Object.keys(table).length).toBeGreaterThan(25);
    expect([...ErrorCode.options].sort()).toEqual(Object.keys(table).sort());
    expect({ ...errorStatus }).toEqual(table);
  });
});
