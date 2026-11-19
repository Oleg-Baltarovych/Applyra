// M0-15: pure parts of `pnpm db:backup` / `pnpm db:restore` (12-infra-ops.md §5). The docker side is checked by a
// manual run (docs/CONTEXT.md §6, M0-15 notes).
import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEEP,
  backupFileName,
  filesToPrune,
  isBackupFileName,
  parseBackupArgs,
  parseRestoreArgs,
  parseTocTables,
  stalePartials,
  verifyRestore,
} from '../scripts/lib/db-backup.mjs';

describe('backupFileName / isBackupFileName', () => {
  it('names a dump after the UTC time, sortable by name', () => {
    expect(backupFileName(new Date('2026-11-19T01:02:03.456Z'))).toBe(
      'applyra-20261119T010203Z.dump',
    );
  });

  it('recognises only its own names', () => {
    expect(isBackupFileName('applyra-20261119T010203Z.dump')).toBe(true);
    expect(isBackupFileName('applyra-20261119T010203Z.dump.partial')).toBe(false);
    expect(isBackupFileName('applyra-latest.dump')).toBe(false);
    expect(isBackupFileName('notes.txt')).toBe(false);
  });
});

describe('filesToPrune (keep the newest BACKUP_KEEP dumps)', () => {
  const dump = (day: number) => `applyra-202611${String(day).padStart(2, '0')}T000000Z.dump`;

  it('keeps 14 by default', () => {
    expect(BACKUP_KEEP).toBe(14);
  });

  it('returns nothing while there are at most `keep` dumps', () => {
    const names = Array.from({ length: 14 }, (_, i) => dump(i + 1));
    expect(filesToPrune(names)).toEqual([]);
  });

  it('returns the oldest dumps beyond `keep`, whatever the listing order', () => {
    const names = [dump(3), dump(1), dump(5), dump(2), dump(4)];
    expect(filesToPrune(names, 3)).toEqual([dump(2), dump(1)]);
  });

  it('never touches files it did not create (partials, other names)', () => {
    const names = [dump(1), dump(2), 'applyra-x.dump', `${dump(0)}.partial`, 'README.md'];
    expect(filesToPrune(names, 1)).toEqual([dump(1)]);
  });

  it('rejects a keep below 1', () => {
    expect(() => filesToPrune([dump(1)], 0)).toThrow(/keep/);
  });
});

describe('parseBackupArgs', () => {
  it('accepts no arguments', () => {
    expect(() => parseBackupArgs([])).not.toThrow();
  });

  it('rejects any argument (no silent typos)', () => {
    expect(() => parseBackupArgs(['--keep', '3'])).toThrow(/usage: pnpm db:backup/);
  });
});

describe('parseRestoreArgs', () => {
  it('returns the single dump path', () => {
    expect(parseRestoreArgs(['backups/applyra-20261119T010203Z.dump'])).toEqual({
      file: 'backups/applyra-20261119T010203Z.dump',
    });
  });

  it.each([[[]], [['a.dump', 'b.dump']], [['--force']], [['']]])('rejects %j', (argv: string[]) => {
    expect(() => parseRestoreArgs(argv)).toThrow(/usage: pnpm db:restore <file>/);
  });
});

describe('parseTocTables (pg_restore --list)', () => {
  it('returns schema-qualified tables that carry data, skipping comments and other entries', () => {
    const toc = [
      ';',
      '; Archive created at 2026-11-19 01:02:03 UTC',
      ';     dbname: applyra',
      '3375; 0 16385 TABLE DATA public _prisma_migrations applyra_maintenance',
      '3376; 0 16400 TABLE DATA public user applyra_maintenance',
      '215; 1259 16400 TABLE public user applyra_maintenance',
      '2; 3079 16386 EXTENSION - pg_trgm ',
    ].join('\n');

    expect(parseTocTables(toc)).toEqual(['public._prisma_migrations', 'public.user']);
  });
});

describe('verifyRestore', () => {
  const toc = ['public._prisma_migrations', 'public.user'];

  it('passes when every dumped table exists and migrations were applied', () => {
    expect(
      verifyRestore(toc, [
        { table: 'public._prisma_migrations', rows: 1 },
        { table: 'public.user', rows: 0 },
      ]),
    ).toEqual([]);
  });

  it('reports dumped tables missing after the restore', () => {
    expect(verifyRestore(toc, [{ table: 'public._prisma_migrations', rows: 2 }])).toEqual([
      'table public.user is in the dump but not in the restored database',
    ]);
  });

  it('reports a dump without applied migrations', () => {
    expect(
      verifyRestore(toc, [
        { table: 'public._prisma_migrations', rows: 0 },
        { table: 'public.user', rows: 3 },
      ]),
    ).toEqual(['public._prisma_migrations is empty: no applied migrations in the dump']);
  });

  it('reports an empty dump', () => {
    expect(verifyRestore([], [])).toEqual(['the dump contains no table data']);
  });
});

describe('stalePartials', () => {
  it('returns only partial dumps left by an interrupted run', () => {
    expect(
      stalePartials([
        'applyra-20261119T010203Z.dump',
        'applyra-20261119T010203Z.dump.partial',
        'other.partial',
        'notes.txt',
      ]),
    ).toEqual(['applyra-20261119T010203Z.dump.partial']);
  });
});
