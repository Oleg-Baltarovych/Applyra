// users repository on Postgres (M0-11): idempotent, race-free settings ensure with DB defaults, owner-only updates,
// and every query passes the user-scope guard in throw mode (testPrisma()).
import { afterAll, describe, expect, it } from 'vitest';
import { UsersRepository } from '../../src/modules/users/users.repository.js';
import { TransactionRunner, type AppPrisma } from '../../src/platform/prisma/index.js';
import { userFactory } from '../factories/index.js';
import { withPg } from './support/pg.js';
import { testPrisma } from './support/prisma.js';
import { testInfra } from './support/test-infra.js';

const prisma: AppPrisma = testPrisma();
const repo = new UsersRepository(prisma);
const runner = new TransactionRunner(prisma);

afterAll(async () => {
  await prisma.$disconnect();
});

const settingsRows = (userId: string) =>
  withPg(testInfra().databaseUrl, (db) =>
    db.query(`SELECT * FROM "UserSettings" WHERE "userId" = $1`, [userId]),
  ).then((r) => r.rows);

const DEFAULTS = {
  timezone: 'UTC',
  timezoneConfirmed: false,
  staleFollowUpDays: 7,
  staleDaysAfterInterview: 10,
  staleGhostDays: 21,
  hotkeysEnabled: true,
};

describe('UsersRepository', () => {
  it('findOwnedUser returns only the public user fields, null for an unknown id', async () => {
    const user = await userFactory.create(prisma);
    expect(await repo.findOwnedUser(user.id)).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      image: null,
      createdAt: user.createdAt,
    });
    expect(await repo.findOwnedUser('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBeNull();
  });

  it('ensureOwnedSettings creates the row with the DB defaults once, also under concurrency', async () => {
    const user = await userFactory.create(prisma);
    expect(await repo.findOwnedSettings(user.id)).toBeNull();

    await Promise.all([repo.ensureOwnedSettings(user.id), repo.ensureOwnedSettings(user.id)]);
    await repo.ensureOwnedSettings(user.id);

    expect(await settingsRows(user.id)).toHaveLength(1);
    expect(await repo.findOwnedSettings(user.id)).toEqual(DEFAULTS);
  });

  it('10 parallel ensures for one user all resolve to the defaults and leave exactly one row', async () => {
    const user = await userFactory.create(prisma);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.ensureOwnedSettings(user.id)),
    );
    expect(results).toEqual(Array.from({ length: 10 }, () => DEFAULTS));
    expect(await settingsRows(user.id)).toHaveLength(1);
  });

  it('ensureOwnedSettings returns the existing row unchanged', async () => {
    const user = await userFactory.create(prisma);
    await repo.ensureOwnedSettings(user.id);
    await repo.updateOwnedSettings(user.id, { staleGhostDays: 50 });
    expect(await repo.ensureOwnedSettings(user.id)).toEqual({ ...DEFAULTS, staleGhostDays: 50 });
  });

  it('concurrent ensures in separate transactions do not fail with a unique violation', async () => {
    const user = await userFactory.create(prisma);
    const ensureAndRead = () =>
      runner.run(async (tx) => {
        return repo.ensureOwnedSettings(user.id, tx);
      });
    const [a, b] = await Promise.all([ensureAndRead(), ensureAndRead()]);
    expect(a).toEqual(DEFAULTS);
    expect(b).toEqual(DEFAULTS);
    expect(await settingsRows(user.id)).toHaveLength(1);
  });

  it("updateOwnedSettings changes only the owner's row and only the given columns", async () => {
    const [owner, other] = await Promise.all([
      userFactory.create(prisma),
      userFactory.create(prisma),
    ]);
    await Promise.all([repo.ensureOwnedSettings(owner.id), repo.ensureOwnedSettings(other.id)]);

    const updated = await repo.updateOwnedSettings(owner.id, {
      staleGhostDays: 40,
      timezone: 'Europe/Kyiv',
      timezoneConfirmed: true,
    });

    expect(updated).toEqual({
      ...DEFAULTS,
      staleGhostDays: 40,
      timezone: 'Europe/Kyiv',
      timezoneConfirmed: true,
    });
    expect(await repo.findOwnedSettings(other.id)).toEqual(DEFAULTS);
  });

  it('the DB CHECK still rejects an out-of-range value that bypassed validation', async () => {
    const user = await userFactory.create(prisma);
    await repo.ensureOwnedSettings(user.id);
    await expect(repo.updateOwnedSettings(user.id, { staleGhostDays: 181 })).rejects.toThrow();
    expect(await repo.findOwnedSettings(user.id)).toEqual(DEFAULTS);
  });
});
