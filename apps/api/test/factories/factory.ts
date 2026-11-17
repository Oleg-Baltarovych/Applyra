// Test-data builders (11-testing.md §3). Models arrive with their tasks (`user` in M0-08); `Db` becomes the
// Prisma transaction client there. Deterministic: a sequence + seeded rng per factory, reset per test file.
import { createRng, DEFAULT_SEED, type Rng } from './rng.js';

export interface BuildContext {
  /** 1-based build counter of this factory (since the last reset). */
  readonly seq: number;
  readonly rng: Rng;
}

export interface Factory<T> {
  build(overrides?: Partial<T>): T;
  buildList(count: number, overrides?: Partial<T>): T[];
  /** Restarts `seq` and the rng from the seed. */
  reset(): void;
}

export interface PersistentFactory<T, R, Db> extends Factory<T> {
  /** Builds a value and stores it through `persist`. */
  create(db: Db, overrides?: Partial<T>): Promise<R>;
}

interface FactoryDefinition<T> {
  readonly build: (ctx: BuildContext) => T;
  readonly seed?: number | undefined;
}

interface PersistentFactoryDefinition<T, R, Db> extends FactoryDefinition<T> {
  readonly persist: (db: Db, value: T) => Promise<R>;
}

const registry = new Set<() => void>();

/** Resets every factory defined so far (called by the integration worker setup before each file). */
export function resetFactories(): void {
  for (const reset of registry) reset();
}

export function defineFactory<T, R, Db>(
  definition: PersistentFactoryDefinition<T, R, Db>,
): PersistentFactory<T, R, Db>;
export function defineFactory<T>(definition: FactoryDefinition<T>): Factory<T>;
export function defineFactory<T, R, Db>(
  definition: FactoryDefinition<T> | PersistentFactoryDefinition<T, R, Db>,
): Factory<T> | PersistentFactory<T, R, Db> {
  const seed = definition.seed ?? DEFAULT_SEED;
  let seq = 0;
  let rng = createRng(seed);

  const reset = (): void => {
    seq = 0;
    rng = createRng(seed);
  };
  registry.add(reset);

  const build = (overrides: Partial<T> = {}): T => {
    seq += 1;
    return { ...definition.build({ seq, rng }), ...overrides };
  };
  const factory: Factory<T> = {
    build,
    buildList: (count, overrides) => Array.from({ length: count }, () => build(overrides)),
    reset,
  };

  if (!('persist' in definition)) return factory;
  const { persist } = definition;
  return { ...factory, create: (db, overrides) => persist(db, build(overrides)) };
}
