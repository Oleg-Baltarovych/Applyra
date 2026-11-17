// platform/prisma against Postgres (M0-08): the user-scope guard on real queries, TransactionRunner commit/rollback
// and token lifecycle, and the persistent `user` factory.
import { afterAll, describe, expect, it } from 'vitest';
import {
  type AppPrisma,
  clientFor,
  createPrismaClient,
  type ScopeMode,
  TransactionRunner,
  type Tx,
  UnscopedQueryError,
} from '../../src/platform/prisma/index.js';
import { userFactory } from '../factories/index.js';
import { testPrisma } from './support/prisma.js';
import { testInfra } from './support/test-infra.js';

const prisma: AppPrisma = testPrisma();
const runner = new TransactionRunner(prisma);

afterAll(async () => {
  await prisma.$disconnect();
});

const isUuidV7 = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);

describe('user factory', () => {
  it('inserts through the app role with distinct UUID v7 ids and readable rows', async () => {
    const a = await userFactory.create(prisma);
    const b = await userFactory.create(prisma, { email: 'second@example.test' });

    expect(isUuidV7(a.id) && isUuidV7(b.id)).toBe(true);
    expect(a.id).not.toBe(b.id);
    const rows = await prisma.user.findMany({
      where: { id: { in: [a.id, b.id] } },
      orderBy: { email: 'asc' },
    });
    expect(rows.map((u) => [u.email, u.role])).toEqual([
      ['second@example.test', 'USER'],
      [a.email, 'USER'],
    ]);
  });
});

describe('user-scope guard (throw mode)', () => {
  it('rejects a UserSettings query without userId, naming model and operation only', async () => {
    const error = await prisma.userSettings
      .findFirst({ where: { timezone: 'UTC' } })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnscopedQueryError);
    expect(error).toMatchObject({ model: 'UserSettings', operation: 'findFirst' });
    expect(error).toMatchObject({ message: expect.not.stringContaining('UTC') });
  });

  it('rejects an unscoped updateMany before it reaches the database', async () => {
    const user = await userFactory.create(prisma);
    await prisma.userSettings.create({ data: { userId: user.id } });

    await expect(
      prisma.userSettings.updateMany({ data: { staleGhostDays: 30 } }),
    ).rejects.toBeInstanceOf(UnscopedQueryError);
    const row = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    expect(row?.staleGhostDays).toBe(21);
  });

  it('passes a query scoped by userId', async () => {
    const user = await userFactory.create(prisma);
    await prisma.userSettings.create({ data: { userId: user.id, timezone: 'Europe/Kyiv' } });

    await expect(
      prisma.userSettings.findUnique({ where: { userId: user.id } }),
    ).resolves.toMatchObject({
      timezone: 'Europe/Kyiv',
    });
  });
});

describe('user-scope guard (warn / off modes)', () => {
  const unscopedWith = async (scopeMode: ScopeMode) => {
    const warnings: string[] = [];
    const client = createPrismaClient({
      url: testInfra().databaseUrl,
      scopeMode,
      logger: { warn: (message) => warnings.push(message) },
    });
    try {
      const rows = await client.userSettings.findMany({ where: { timezone: 'Nowhere/Zone' } });
      return { rows, warnings };
    } finally {
      await client.$disconnect();
    }
  };

  it('warn (development): runs the query and logs model + operation', async () => {
    const { rows, warnings } = await unscopedWith('warn');

    expect(rows).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining('UserSettings.findMany')]);
    expect(warnings[0]).not.toContain('Nowhere');
  });

  it('off (production): runs the query silently', async () => {
    await expect(unscopedWith('off')).resolves.toEqual({ rows: [], warnings: [] });
  });
});

describe('TransactionRunner', () => {
  it('commits when fn resolves; the repository side resolves the token to the tx client', async () => {
    const email = 'commit@example.test';
    const id = await runner.run(async (tx) => {
      const db = clientFor(prisma, tx);
      const user = await userFactory.create(db, { email });
      // Visible inside the transaction, through the same token.
      expect(await clientFor(prisma, tx).user.count({ where: { email } })).toBe(1);
      return user.id;
    });

    expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({ email });
  });

  it('rolls back every write when fn throws', async () => {
    const email = 'rollback@example.test';
    await expect(
      runner.run(async (tx) => {
        await userFactory.create(clientFor(prisma, tx), { email });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('applies the user-scope guard inside the transaction (and rolls back)', async () => {
    const email = 'scoped-tx@example.test';
    await expect(
      runner.run(async (tx) => {
        const db = clientFor(prisma, tx);
        await userFactory.create(db, { email });
        await db.userSettings.findMany({});
      }),
    ).rejects.toBeInstanceOf(UnscopedQueryError);

    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('rejects a token used after the transaction committed', async () => {
    const leaked: Tx = await runner.run((tx) => Promise.resolve(tx));

    expect(() => clientFor(prisma, leaked)).toThrow(/outside its transaction/);
  });

  it('rejects a token used after the transaction rolled back', async () => {
    let leaked: Tx | undefined;
    await expect(
      runner.run((tx) => {
        leaked = tx;
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');

    expect(leaked).toBeDefined();
    expect(() => clientFor(prisma, leaked)).toThrow(/outside its transaction/);
  });

  it('rejects a nested run without opening a second transaction (the outer one rolls back)', async () => {
    const email = 'nested@example.test';
    await expect(
      runner.run(async (tx) => {
        await userFactory.create(clientFor(prisma, tx), { email });
        await runner.run(() => Promise.resolve());
      }),
    ).rejects.toThrow(/nested transaction/);

    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});
