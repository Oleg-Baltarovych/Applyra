// Runtime Prisma client (ADR 016): driver adapter @prisma/adapter-pg on DATABASE_URL (role applyra_app, DML only),
// extended with the user-scope guard. Connects lazily on the first query — booting the app needs no database.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';
import {
  type ScopeMode,
  type ScopeWarnLogger,
  userScopeExtension,
} from './user-scope.extension.js';

export interface PrismaClientOptions {
  /** postgres(ql):// URL of applyra_app. */
  readonly url: string;
  readonly scopeMode: ScopeMode;
  readonly logger: ScopeWarnLogger;
}

export function createPrismaClient({ url, scopeMode, logger }: PrismaClientOptions) {
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter }).$extends(userScopeExtension(scopeMode, logger));
}

/** The app-wide client (DI token PRISMA). Only *.repository.ts and platform/** may use it (rule 4). */
export type AppPrisma = ReturnType<typeof createPrismaClient>;
/** Client inside an interactive transaction (no $connect/$transaction/…). */
export type TxClient = Parameters<Parameters<AppPrisma['$transaction']>[0]>[0];
