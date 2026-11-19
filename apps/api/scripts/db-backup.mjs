// `pnpm db:backup` (M0-15, 12-infra-ops.md §5): `pg_dump -Fc` of the local compose database as role `backup`
// (pg_read_all_data, NOREPLICATION until WAL-G) via `docker compose exec`, into ./backups/ (gitignored); keeps the
// newest 14 dumps. Run manually or from cron / Task Scheduler. Restore check: `pnpm db:restore <file>`.
// Env: APPLYRA_BACKUP_PASSWORD (required). The repo-root env file is read only when it is not set at all (same
// rule as db-migrate.mjs). The password reaches pg_dump as PGPASSWORD through the environment of
// `docker compose exec -e PGPASSWORD` (name only on argv), never on a command line or in output.
// Compose itself resolves the project as usual (root compose.yaml + its env file / COMPOSE_ENV_FILES).
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupFileName, filesToPrune, parseBackupArgs, stalePartials } from './lib/db-backup.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const rootEnvFile = path.join(repoRoot, '.env');
const backupsDir = path.join(repoRoot, 'backups');

/** @param {string} message */
function fail(message) {
  console.error(`db-backup: ${message}`);
  process.exit(1);
}

try {
  parseBackupArgs(process.argv.slice(2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (process.env.APPLYRA_BACKUP_PASSWORD === undefined && existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}
const password = process.env.APPLYRA_BACKUP_PASSWORD;
if (!password) fail('APPLYRA_BACKUP_PASSWORD is not set (role backup, see .env.example).');

// 0700 dir / 0600 files: dumps hold real data. POSIX modes only — on Windows the folder inherits the user
// profile's ACLs (12 §5).
mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
for (const stale of stalePartials(readdirSync(backupsDir)))
  rmSync(path.join(backupsDir, stale), { force: true });
const name = backupFileName(new Date());
const target = path.join(backupsDir, name);
// Written under a name rotation ignores and renamed only after pg_dump succeeded: a failed run leaves no
// truncated file that would count as one of the 14.
const partial = `${target}.partial`;
const out = openSync(partial, 'wx', 0o600);
const dump = spawnSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    '-e',
    'PGPASSWORD',
    'postgres',
    'pg_dump',
    '--format=custom',
    // Service name, not 127.0.0.1: the image's pg_hba trusts loopback, so only a non-loopback address makes
    // the server check the backup role's password (scram-sha-256).
    '--host=postgres',
    '--username=backup',
    '--dbname=applyra',
    '--no-password',
  ],
  {
    cwd: repoRoot,
    stdio: ['ignore', out, 'pipe'],
    env: { ...process.env, PGPASSWORD: password },
    encoding: 'utf8',
  },
);
closeSync(out);

if (dump.error || dump.status !== 0) {
  rmSync(partial, { force: true });
  const detail = dump.error ? dump.error.message : dump.stderr.trim();
  fail(
    `pg_dump failed (exit ${String(dump.status ?? dump.signal)}): ${detail}\n` +
      'Is the stack up? `docker compose up -d postgres` (repo root).',
  );
}
if (dump.stderr.trim()) process.stderr.write(dump.stderr);
const { size } = statSync(partial);
if (size === 0) {
  rmSync(partial, { force: true });
  fail('pg_dump produced an empty file.');
}
renameSync(partial, target);

const pruned = filesToPrune(readdirSync(backupsDir));
// The new dump is already in place: a failed prune only warns, the run still succeeds.
const failedPrunes = [];
for (const old of pruned) {
  try {
    rmSync(path.join(backupsDir, old));
  } catch (error) {
    failedPrunes.push(old);
    console.warn(
      `db-backup: could not remove ${old}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
const removed = pruned.filter((name) => !failedPrunes.includes(name));

console.log(
  `db-backup: wrote backups/${name} (${(size / 1024).toFixed(1)} KiB)` +
    (removed.length > 0 ? `; removed ${removed.length} old dump(s): ${removed.join(', ')}` : ''),
);
