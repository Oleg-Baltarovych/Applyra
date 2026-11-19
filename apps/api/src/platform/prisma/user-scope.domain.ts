// User-scope guard rules (D-3, 05 §1): a query on a user-owned model must filter by its owner key. Pure — the
// Prisma Client extension (user-scope.extension.ts) applies it. A safety net only: repositories' findOwned*
// helpers and the IDOR tests remain the primary defence.

/**
 * User-owned model → owner key. Every new user-owned model is added here with its migration. Job is guarded by
 * `ownerId` while R0 has only PRIVATE rows (findAccessibleJob = `{ id, ownerId }`); when R2 adds PUBLIC jobs
 * (ownerId NULL, readable by all), move Job to UNGUARDED_OWNED_MODELS with that reason. Auth tables (User, Session,
 * Account, Verification) are deliberately absent: Better Auth queries them by token/id/email, and User is the
 * identity itself.
 */
export const USER_SCOPED_MODELS: Readonly<Record<string, string>> = Object.freeze({
  UserSettings: 'userId',
  Job: 'ownerId',
  Application: 'userId',
  ApplicationEvent: 'userId',
  Reminder: 'userId',
  ImportSession: 'userId',
  IdempotencyRecord: 'userId',
});

/**
 * Models that have an owner column but are deliberately NOT guarded, with the reason. Every model with a
 * `userId`/`ownerId` column is either in USER_SCOPED_MODELS or here (test/user-scope-coverage.test.ts).
 */
export const UNGUARDED_OWNED_MODELS: Readonly<Record<string, string>> = Object.freeze({
  // Better Auth looks sessions up by token (and lists/deletes them by userId itself).
  Session: 'Better Auth: queried by token',
  // Better Auth looks accounts up by providerId + accountId / id during OAuth linking.
  Account: 'Better Auth: queried by providerId + accountId',
});

/** Operations whose `where` must carry the owner key. create* are skipped: the NOT NULL owner FK enforces it. */
const CHECKED_OPERATIONS: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOwnerId = (value: unknown): value is string => typeof value === 'string' && value !== '';

export interface OwnerScopeOptions {
  /** Accept `{ in: [ids] }` (non-empty list of non-empty ids) — findMany only. */
  readonly allowIn?: boolean;
}

/**
 * A filter on the owner key that pins the owner: a non-empty id, `{ equals: id }`, or (allowIn) `{ in: [ids] }`.
 * Anything else — null, `{}`, `{ not }`, `{ notIn }`, `{ in: [] }`, mixed operators — does not.
 */
function pinsOwner(value: unknown, allowIn: boolean): boolean {
  if (isOwnerId(value)) return true;
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1) return false;
  if (keys[0] === 'equals') return isOwnerId(value.equals);
  if (keys[0] === 'in' && allowIn) {
    const ids = value.in;
    return Array.isArray(ids) && ids.length > 0 && ids.every(isOwnerId);
  }
  return false;
}

/**
 * True iff `where` pins the owner key (see pinsOwner): on `field` itself, inside a compound unique key
 * (`a_b: { a, b }`) that contains `field`, or in an element of a top-level `AND`. `OR`/`NOT` never count (they
 * widen or invert the filter); `field: undefined` does not count (Prisma drops undefined filters).
 */
export function isOwnerScoped(
  where: unknown,
  field: string,
  options: OwnerScopeOptions = {},
): boolean {
  if (!isRecord(where)) return false;
  const allowIn = options.allowIn ?? false;
  for (const [key, value] of Object.entries(where)) {
    if (key === field) {
      if (pinsOwner(value, allowIn)) return true;
    } else if (key === 'AND') {
      const parts: readonly unknown[] = Array.isArray(value) ? value : [value];
      if (parts.some((part) => isOwnerScoped(part, field, options))) return true;
    } else if (key.split('_').includes(field) && isRecord(value)) {
      // Compound unique input: equality on every part, so only a plain id counts.
      if (isOwnerId(value[field])) return true;
    }
  }
  return false;
}

/** True when `operation` on `model` must be owner-scoped and `args.where` is not. Raw queries (no model) pass. */
export function isUnscopedQuery(
  model: string | undefined,
  operation: string,
  args: unknown,
): boolean {
  if (model === undefined || !CHECKED_OPERATIONS.has(operation)) return false;
  const field = USER_SCOPED_MODELS[model];
  if (field === undefined) return false;
  const where = isRecord(args) ? args.where : undefined;
  return !isOwnerScoped(where, field, { allowIn: operation === 'findMany' });
}
