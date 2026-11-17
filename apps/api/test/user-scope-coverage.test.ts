// Every Prisma model with an owner column (`userId` / `ownerId`) must be guarded by the user-scope extension or
// listed, with a reason, as deliberately unguarded (D-3). A new user-owned model fails this test until classified.
import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/platform/prisma/generated/client.js';
import {
  UNGUARDED_OWNED_MODELS,
  USER_SCOPED_MODELS,
} from '../src/platform/prisma/user-scope.domain.js';

const OWNER_COLUMNS = ['userId', 'ownerId'];
// Generated public API: Prisma.<Model>ScalarFieldEnum for each Prisma.ModelName.
const namespace: Readonly<Record<string, unknown>> = Prisma;

const scalarFields = (model: string): string[] => {
  const fields = namespace[`${model}ScalarFieldEnum`];
  if (typeof fields !== 'object' || fields === null)
    throw new Error(`no ScalarFieldEnum for ${model}`);
  return Object.values(fields).filter((v): v is string => typeof v === 'string');
};

describe('user-scope guard coverage', () => {
  const owned = Object.values(Prisma.ModelName)
    .map((model) => ({ model, column: scalarFields(model).find((f) => OWNER_COLUMNS.includes(f)) }))
    .filter((m): m is { model: Prisma.ModelName; column: string } => m.column !== undefined);

  it('finds the owner-column models of the schema', () => {
    expect(owned.map((m) => m.model).sort()).toEqual(['Account', 'Session', 'UserSettings']);
  });

  it('classifies every model with an owner column (guarded with that column, or unguarded with a reason)', () => {
    const unclassified = owned.filter(
      ({ model, column }) =>
        USER_SCOPED_MODELS[model] !== column && !(UNGUARDED_OWNED_MODELS[model] ?? '').trim(),
    );
    expect(unclassified).toEqual([]);
  });

  it('lists no model twice and no model that does not exist', () => {
    const models: string[] = Object.values(Prisma.ModelName);
    const guarded = Object.keys(USER_SCOPED_MODELS);
    const unguarded = Object.keys(UNGUARDED_OWNED_MODELS);
    expect(guarded.filter((m) => unguarded.includes(m))).toEqual([]);
    expect([...guarded, ...unguarded].filter((m) => !models.includes(m))).toEqual([]);
  });
});
