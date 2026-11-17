// `user` factory (M0-08): persists through the app-role client (AppPrisma or a TxClient), so inserts exercise the
// same privileges as the api. The id comes from the database default (uuidv7(), 05 D-1).
import type { AppPrisma, TxClient } from '../../src/platform/prisma/index.js';
import type { User } from '../../src/platform/prisma/generated/client.js';
import { defineFactory } from './factory.js';

export interface UserBuild {
  name: string;
  email: string;
  emailVerified: boolean;
  role: 'USER' | 'ADMIN';
}

export const userFactory = defineFactory<UserBuild, User, AppPrisma | TxClient>({
  build: ({ seq }) => ({
    name: `Test User ${String(seq)}`,
    email: `user${String(seq)}@example.test`,
    emailVerified: true,
    role: 'USER',
  }),
  persist: (db, data) => db.user.create({ data }),
});
