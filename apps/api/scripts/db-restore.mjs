// `pnpm db:restore <file>` (M0-15, 12-infra-ops.md §5): restores a `pnpm db:backup` dump into a throwaway
// postgres container — same image as the compose `postgres` service (read from `docker compose config`, so there is
// no second pin), no network, trust auth inside it only — then verifies it and removes the container. Never touches
// the compose database. Verification: every TABLE DATA entry of `pg_restore --list` exists after the restore,
// `_prisma_migrations` is not empty, and exact row counts per table are printed.
// Roles of the source cluster do not exist in the throwaway one: restored with --no-owner --no-privileges.
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, statSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseRestoreArgs, parseTocTables, verifyRestore } from './lib/db-backup.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const READY_TIMEOUT_MS = 60_000;
const DUMP_IN_CONTAINER = '/tmp/restore.dump';
const COUNTS_SQL = `
SELECT format('%s.%s', table_schema, table_name),
       (xpath('/row/c/text()', query_to_xml(
          format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
FROM information_schema.tables
WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1`;

/** @param {string} message */
function fail(message) {
  console.error(`db-restore: ${message}`);
  process.exit(1);
}

/**
 * docker CLI without a shell; throws with its stderr on a non-zero exit.
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} [options]
 */
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { cwd: repoRoot, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args[0]} ${args[1] ?? ''} failed: ${String(result.stderr).trim()}`);
  }
  return String(result.stdout);
}

let file;
try {
  ({ file } = parseRestoreArgs(process.argv.slice(2)));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
// pnpm runs root scripts from the repo root; INIT_CWD is where the user typed the command.
const dumpPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
try {
  if (!statSync(dumpPath).isFile()) fail(`${file} is not a file.`);
} catch {
  fail(`${file} does not exist.`);
}

/** @type {string} */
let image;
try {
  const config = JSON.parse(docker(['compose', 'config', '--no-interpolate', '--format', 'json']));
  image = config.services?.postgres?.image;
  if (typeof image !== 'string') throw new Error('compose service "postgres" has no image');
} catch (error) {
  fail(
    `cannot read the postgres image from compose: ${error instanceof Error ? error.message : error}`,
  );
}

const container = `applyra-restore-${Date.now()}`;
let removed = false;
const removeContainer = () => {
  if (removed) return;
  removed = true;
  spawnSync('docker', ['rm', '--force', '--volumes', container], { stdio: 'ignore' });
};
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.on(signal, () => {
    removeContainer();
    process.exit(code);
  });
}

let exitCode = 0;
try {
  console.log(
    `db-restore: ${path.basename(dumpPath)} → throwaway container ${container} (${image})`,
  );
  docker([
    'run',
    '--detach',
    '--name',
    container,
    '--network',
    'none',
    '--label',
    'applyra.restore=true',
    // No network at all, so trust auth reaches nobody; no password to pass around.
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '-e',
    'POSTGRES_DB=applyra',
    image,
  ]);

  // TCP check: the entrypoint's temporary init server listens on the unix socket only.
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const isReady = () =>
    spawnSync(
      'docker',
      ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'applyra'],
      { stdio: 'ignore' },
    ).status === 0;
  while (!isReady()) {
    if (Date.now() > deadline) throw new Error('throwaway postgres did not become ready in 60 s');
    await sleep(1000);
  }

  // Streamed over stdin rather than `docker cp`: no host-path quirks (Windows drive letters, Git Bash).
  const dumpFd = openSync(dumpPath, 'r');
  try {
    docker(['exec', '-i', container, 'sh', '-c', `cat > ${DUMP_IN_CONTAINER}`], {
      stdio: [dumpFd, 'pipe', 'pipe'],
    });
  } finally {
    closeSync(dumpFd);
  }

  const toc = docker(['exec', container, 'pg_restore', '--list', DUMP_IN_CONTAINER]);
  docker([
    'exec',
    container,
    'pg_restore',
    '--username=postgres',
    '--dbname=applyra',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    DUMP_IN_CONTAINER,
  ]);

  const counts = docker([
    'exec',
    container,
    'psql',
    '--username=postgres',
    '--dbname=applyra',
    '--no-psqlrc',
    '--tuples-only',
    '--no-align',
    '--field-separator=\t',
    '--set=ON_ERROR_STOP=1',
    '--command',
    COUNTS_SQL,
  ])
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [table = '', rows = ''] = line.split('\t');
      return { table, rows: Number(rows) };
    });

  for (const { table, rows } of counts) console.log(`  ${table.padEnd(40)} ${rows}`);
  const problems = verifyRestore(parseTocTables(toc), counts);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`db-restore: ${problem}`);
    exitCode = 1;
  } else {
    console.log(`db-restore: OK — ${counts.length} tables restored and verified.`);
  }
} catch (error) {
  console.error(`db-restore: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  removeContainer();
  console.log(`db-restore: removed ${container}.`);
}
process.exit(exitCode);
