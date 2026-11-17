// Public API of platform/prisma. Services import only transaction.ts (rule 4); repositories also use prisma-tx.ts.
export { type AppPrisma, createPrismaClient, type TxClient } from './prisma.client.js';
export { PRISMA } from './prisma.constants.js';
export { PrismaModule } from './prisma.module.js';
export { clientFor } from './prisma-tx.js';
export { TransactionRunner, type Tx } from './transaction.js';
export { type ScopeMode, scopeModeFor, UnscopedQueryError } from './user-scope.extension.js';
