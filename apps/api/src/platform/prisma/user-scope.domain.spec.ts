import { describe, expect, it } from 'vitest';
import { isOwnerScoped, isUnscopedQuery, USER_SCOPED_MODELS } from './user-scope.domain.js';

describe('isOwnerScoped', () => {
  it('accepts the owner key as a non-empty string or { equals: <string> }', () => {
    expect(isOwnerScoped({ userId: 'u1' }, 'userId')).toBe(true);
    expect(isOwnerScoped({ id: 'x', userId: 'u1' }, 'userId')).toBe(true);
    expect(isOwnerScoped({ userId: { equals: 'u1' } }, 'userId')).toBe(true);
  });

  it('accepts { in: [non-empty strings] } only when allowed (findMany)', () => {
    expect(isOwnerScoped({ userId: { in: ['u1', 'u2'] } }, 'userId', { allowIn: true })).toBe(true);
    expect(isOwnerScoped({ userId: { in: ['u1'] } }, 'userId')).toBe(false);
    expect(isOwnerScoped({ userId: { in: [] } }, 'userId', { allowIn: true })).toBe(false);
    expect(isOwnerScoped({ userId: { in: ['u1', ''] } }, 'userId', { allowIn: true })).toBe(false);
    expect(isOwnerScoped({ userId: { in: 'u1' } }, 'userId', { allowIn: true })).toBe(false);
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
    ['a number', 1],
    ['an empty object', {}],
    ['{ not }', { not: 'u1' }],
    ['{ notIn }', { notIn: ['u1'] }],
    ['{ equals: null }', { equals: null }],
    ['{ equals: "" }', { equals: '' }],
    ['{ equals } with another operator', { equals: 'u1', not: 'u2' }],
    ['{ gt }', { gt: 'a' }],
  ])('rejects an owner value of %s', (_label, value) => {
    expect(isOwnerScoped({ userId: value }, 'userId', { allowIn: true })).toBe(false);
  });

  it('rejects a missing owner key, an empty where and no where at all', () => {
    expect(isOwnerScoped({ id: 'x' }, 'userId')).toBe(false);
    expect(isOwnerScoped({}, 'userId')).toBe(false);
    expect(isOwnerScoped(undefined, 'userId')).toBe(false);
    expect(isOwnerScoped(null, 'userId')).toBe(false);
  });

  it('rejects an owner key set to undefined (Prisma drops undefined filters)', () => {
    expect(isOwnerScoped({ userId: undefined }, 'userId')).toBe(false);
  });

  it('accepts a compound unique key that contains the owner field', () => {
    expect(isOwnerScoped({ userId_jobId: { userId: 'u1', jobId: 'j1' } }, 'userId')).toBe(true);
    expect(isOwnerScoped({ jobId_userId: { jobId: 'j1', userId: 'u1' } }, 'userId')).toBe(true);
  });

  it('rejects a compound key without the owner field, a non-object value or an undefined owner inside', () => {
    expect(
      isOwnerScoped({ providerId_accountId: { providerId: 'g', accountId: 'a' } }, 'userId'),
    ).toBe(false);
    expect(isOwnerScoped({ userId_jobId: 'u1' }, 'userId')).toBe(false);
    expect(isOwnerScoped({ userId_jobId: { userId: undefined, jobId: 'j1' } }, 'userId')).toBe(
      false,
    );
    expect(isOwnerScoped({ myuserIdx_jobId: { myuserIdx: 'u1' } }, 'userId')).toBe(false);
    expect(isOwnerScoped({ userId_jobId: { userId: '', jobId: 'j1' } }, 'userId')).toBe(false);
    expect(isOwnerScoped({ userId_jobId: { userId: { not: 'u1' }, jobId: 'j1' } }, 'userId')).toBe(
      false,
    );
  });

  it('accepts a scoped AND element (object or array), recursively', () => {
    expect(isOwnerScoped({ AND: { userId: 'u1' } }, 'userId')).toBe(true);
    expect(isOwnerScoped({ AND: [{ id: 'x' }, { userId: 'u1' }] }, 'userId')).toBe(true);
    expect(isOwnerScoped({ AND: [{ AND: [{ userId: 'u1' }] }] }, 'userId')).toBe(true);
  });

  it('rejects AND without a scoped element', () => {
    expect(isOwnerScoped({ AND: [{ id: 'x' }] }, 'userId')).toBe(false);
    expect(isOwnerScoped({ AND: [] }, 'userId')).toBe(false);
  });

  it('does not count OR / NOT: they widen or invert the filter', () => {
    expect(isOwnerScoped({ OR: [{ userId: 'u1' }, { id: 'x' }] }, 'userId')).toBe(false);
    expect(isOwnerScoped({ OR: [{ userId: 'u1' }] }, 'userId')).toBe(false);
    expect(isOwnerScoped({ NOT: { userId: 'u1' } }, 'userId')).toBe(false);
  });
});

describe('isUnscopedQuery', () => {
  it('lists the R0 user-owned models with their owner key and no auth tables (Better Auth queries them by token/id/email)', () => {
    expect(USER_SCOPED_MODELS).toEqual({
      UserSettings: 'userId',
      Job: 'ownerId',
      Application: 'userId',
      ApplicationEvent: 'userId',
      Reminder: 'userId',
      ImportSession: 'userId',
      IdempotencyRecord: 'userId',
    });
  });

  it('guards Job by ownerId (R0: PRIVATE only), not userId', () => {
    expect(isUnscopedQuery('Job', 'findFirst', { where: { id: 'j1' } })).toBe(true);
    expect(isUnscopedQuery('Job', 'findFirst', { where: { id: 'j1', userId: 'u1' } })).toBe(true);
    expect(isUnscopedQuery('Job', 'findFirst', { where: { id: 'j1', ownerId: 'u1' } })).toBe(false);
  });

  it('accepts the Application (id, userId) compound unique key', () => {
    expect(
      isUnscopedQuery('Application', 'findUnique', {
        where: { id_userId: { id: 'a1', userId: 'u1' } },
      }),
    ).toBe(false);
  });

  it.each([
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
  ])('flags %s on a user-scoped model without the owner key', (operation) => {
    expect(isUnscopedQuery('UserSettings', operation, { where: { timezone: 'UTC' } })).toBe(true);
    expect(isUnscopedQuery('UserSettings', operation, {})).toBe(true);
    expect(isUnscopedQuery('UserSettings', operation, undefined)).toBe(true);
  });

  it('allows { in } for findMany only', () => {
    const args = { where: { userId: { in: ['u1', 'u2'] } } };
    expect(isUnscopedQuery('UserSettings', 'findMany', args)).toBe(false);
    expect(isUnscopedQuery('UserSettings', 'deleteMany', args)).toBe(true);
    expect(isUnscopedQuery('UserSettings', 'findFirst', args)).toBe(true);
  });

  it('flags a null or negated owner filter', () => {
    expect(isUnscopedQuery('UserSettings', 'findFirst', { where: { userId: null } })).toBe(true);
    expect(isUnscopedQuery('UserSettings', 'findMany', { where: { userId: { not: 'u1' } } })).toBe(
      true,
    );
  });

  it('passes a scoped query', () => {
    expect(isUnscopedQuery('UserSettings', 'findUnique', { where: { userId: 'u1' } })).toBe(false);
    expect(
      isUnscopedQuery('UserSettings', 'updateMany', { where: { AND: [{ userId: 'u1' }] } }),
    ).toBe(false);
  });

  it('skips creates (the NOT NULL owner FK enforces the owner)', () => {
    for (const operation of ['create', 'createMany', 'createManyAndReturn']) {
      expect(isUnscopedQuery('UserSettings', operation, { data: {} })).toBe(false);
    }
  });

  it('skips models outside the list and raw queries (no model)', () => {
    expect(isUnscopedQuery('User', 'findMany', {})).toBe(false);
    expect(isUnscopedQuery('Session', 'deleteMany', { where: { token: 't' } })).toBe(false);
    expect(isUnscopedQuery(undefined, '$queryRaw', {})).toBe(false);
  });

  it('treats a non-object args value as no where', () => {
    expect(isUnscopedQuery('UserSettings', 'findMany', 'x')).toBe(true);
  });
});
