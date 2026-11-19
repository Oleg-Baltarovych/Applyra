import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyState, type SentState } from './dedup.ts';

/** Default location, relative to the working directory (apps/digest under pnpm --filter). */
export const DEFAULT_STATE_PATH = '.state/sent.json';

const isState = (v: unknown): v is SentState =>
  typeof v === 'object' &&
  v !== null &&
  'version' in v &&
  v.version === 1 &&
  'sent' in v &&
  typeof v.sent === 'object' &&
  v.sent !== null &&
  Object.values(v.sent).every((at) => typeof at === 'string' && !Number.isNaN(Date.parse(at)));

/** Missing file → empty state (first run). A corrupt file fails loudly instead of resending everything. */
export async function loadState(file: string): Promise<SentState> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return emptyState();
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isState(parsed)) throw new Error(`Invalid state file: ${file}`);
  return parsed;
}

/** Where the sent state lives; main.ts only talks to this (file in production, stubs in tests). */
export interface StateStore {
  load(): Promise<SentState>;
  save(state: SentState): Promise<void>;
}

export const fileStore = (file: string): StateStore => ({
  load: () => loadState(file),
  save: (state) => saveState(file, state),
});

/** Atomic write (temp file + rename), creating the directory if needed. */
export async function saveState(file: string, state: SentState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}
