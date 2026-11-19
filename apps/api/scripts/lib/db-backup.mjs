// Pure helpers of db-backup.mjs / db-restore.mjs (M0-15, 12-infra-ops.md §5): file naming, rotation, argument
// validation, restore verification. No I/O here — covered by test/db-backup-lib.test.ts.

/** Dumps kept in ./backups/ after each run (12 §5). */
export const BACKUP_KEEP = 14;

const NAME = /^applyra-\d{8}T\d{6}Z\.dump$/;

/**
 * `applyra-YYYYMMDDTHHMMSSZ.dump` (UTC): lexicographic order = chronological order.
 * @param {Date} date
 */
export function backupFileName(date) {
  const stamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll(/[-:]/g, '');
  return `applyra-${stamp}.dump`;
}

/** @param {string} name */
export function isBackupFileName(name) {
  return NAME.test(name);
}

/**
 * Dumps to delete so that only the newest `keep` remain. Only names this script creates are considered, so
 * partial downloads and anything else put into ./backups/ by hand are never deleted.
 * @param {readonly string[]} names directory listing (any order)
 * @param {number} [keep]
 * @returns {string[]} newest first
 */
export function filesToPrune(names, keep = BACKUP_KEEP) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`keep must be a positive integer`);
  return names.filter(isBackupFileName).sort().reverse().slice(keep);
}

/**
 * `<dump name>.partial` files of an earlier run that was killed mid-dump (deleted at the start of the next run).
 * @param {readonly string[]} names
 * @returns {string[]}
 */
export function stalePartials(names) {
  return names.filter(
    (name) => name.endsWith('.partial') && isBackupFileName(name.slice(0, -'.partial'.length)),
  );
}

/** @param {readonly string[]} argv */
export function parseBackupArgs(argv) {
  if (argv.length > 0) throw new Error('usage: pnpm db:backup (no arguments)');
}

/**
 * @param {readonly string[]} argv
 * @returns {{ file: string }}
 */
export function parseRestoreArgs(argv) {
  const [file, ...rest] = argv;
  if (file === undefined || file === '' || file.startsWith('-') || rest.length > 0) {
    throw new Error('usage: pnpm db:restore <file>   (a dump from ./backups/)');
  }
  return { file };
}

/**
 * `schema.table` of every TABLE DATA entry in `pg_restore --list` output.
 * Entry format: `<id>; <catalog oid> <oid> TABLE DATA <schema> <name> <owner>`.
 * @param {string} toc
 * @returns {string[]}
 */
export function parseTocTables(toc) {
  return toc
    .split(/\r?\n/)
    .map((line) => /^\d+; \d+ \d+ TABLE DATA (\S+) (\S+) /.exec(line))
    .filter((match) => match !== null)
    .map((match) => `${match[1]}.${match[2]}`);
}

const MIGRATIONS_TABLE = 'public._prisma_migrations';

/**
 * Problems found after a restore (empty = OK): every dumped table must exist in the restored database, and the
 * migrations table must hold at least one applied migration (sanity check that this is an Applyra database).
 * @param {readonly string[]} tocTables from parseTocTables
 * @param {readonly { table: string; rows: number }[]} counts exact row counts of the restored tables
 * @returns {string[]}
 */
export function verifyRestore(tocTables, counts) {
  if (tocTables.length === 0) return ['the dump contains no table data'];
  const rows = new Map(counts.map(({ table, rows: n }) => [table, n]));
  const problems = tocTables
    .filter((table) => !rows.has(table))
    .map((table) => `table ${table} is in the dump but not in the restored database`);
  if (rows.get(MIGRATIONS_TABLE) === 0) {
    problems.push(`${MIGRATIONS_TABLE} is empty: no applied migrations in the dump`);
  }
  return problems;
}
