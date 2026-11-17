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
