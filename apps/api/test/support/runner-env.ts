// The only reader of the process environment under apps/api/test (convention, M0-07a): test runner variables,
// never application config — tests build that explicitly via testEnv().

type RunnerEnv = Readonly<Record<string, string | undefined>>;

/** Vitest worker slot (`VITEST_POOL_ID`, ≤ maxWorkers). Base differs between Vitest majors → any non-negative int. */
export function readPoolId(env: RunnerEnv = process.env): number {
  const raw = env.VITEST_POOL_ID;
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new Error(
      `VITEST_POOL_ID: expected a non-negative integer, got ${raw === undefined ? 'nothing' : `"${raw}"`}`,
    );
  }
  return Number(raw);
}

/**
 * Minimal environment for a child process the tests spawn (e.g. scripts/db-migrate.mjs): enough for node to find
 * executables and temp dirs — nothing else from the runner leaks in (no env file, no app config).
 */
export function childProcessEnv(
  extra: Readonly<Record<string, string>>,
  env: RunnerEnv = process.env,
): Record<string, string> {
  const base: Record<string, string> = {};
  // process.env is case-insensitive on Windows (`Path`), so PATH resolves there too.
  for (const key of ['PATH', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) {
    const value = env[key];
    if (value !== undefined) base[key] = value;
  }
  // No Prisma update check / telemetry ping from test runs.
  return { ...base, CHECKPOINT_DISABLE: '1', ...extra };
}
