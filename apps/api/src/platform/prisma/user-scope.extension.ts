// Prisma Client extension applying user-scope.domain.ts to every model operation (D-3 safety net).
// Limitation (Prisma query extensions): nested reads/writes and relation `include`s are not intercepted, and raw
// queries are skipped — IDOR tests remain the primary defence; this catches the forgotten top-level `userId`.
import { Prisma } from './generated/client.js';
import { isUnscopedQuery } from './user-scope.domain.js';

/** throw — tests (a missing owner key fails the test); warn — development; off — production (no per-query cost). */
export type ScopeMode = 'throw' | 'warn' | 'off';

export function scopeModeFor(nodeEnv: 'development' | 'test' | 'production'): ScopeMode {
  switch (nodeEnv) {
    case 'test':
      return 'throw';
    case 'development':
      return 'warn';
    case 'production':
      return 'off';
  }
}

/** Carries model + operation only — never argument values (they may hold PII). */
export class UnscopedQueryError extends Error {
  constructor(
    readonly model: string,
    readonly operation: string,
  ) {
    super(`Unscoped query: ${model}.${operation} without its owner key in \`where\``);
    this.name = 'UnscopedQueryError';
  }
}

export interface ScopeWarnLogger {
  warn(message: string): void;
}

export function userScopeExtension(mode: ScopeMode, logger: ScopeWarnLogger) {
  return Prisma.defineExtension({
    name: 'user-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (mode !== 'off' && isUnscopedQuery(model, operation, args)) {
            const error = new UnscopedQueryError(model, operation);
            if (mode === 'throw') throw error;
            logger.warn(error.message);
          }
          return query(args);
        },
      },
    },
  });
}
