import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyState, markSent, selectNew } from '../src/dedup.ts';
import { loadState, saveState } from '../src/state.ts';
import { vacancy } from './support/vacancy.ts';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'digest-state-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('state file', () => {
  it('starts empty when the file does not exist', async () => {
    expect(await loadState(path.join(dir, 'missing.json'))).toEqual(emptyState());
  });

  it('round-trips through a nested path that does not exist yet', async () => {
    const file = path.join(dir, 'a', 'b', 'sent.json');
    const v = vacancy();
    await saveState(file, markSent(emptyState(), [v], new Date('2026-11-19T06:00:00Z')));
    const loaded = await loadState(file);
    expect(selectNew([v], loaded)).toEqual([]);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(loaded);
  });

  it('fails loudly on a corrupt file instead of resending everything', async () => {
    const file = path.join(dir, 'sent.json');
    await writeFile(file, '{"version":2}', 'utf8');
    await expect(loadState(file)).rejects.toThrow(/Invalid state file/);
    await writeFile(file, 'not json', 'utf8');
    await expect(loadState(file)).rejects.toThrow();
  });
});
