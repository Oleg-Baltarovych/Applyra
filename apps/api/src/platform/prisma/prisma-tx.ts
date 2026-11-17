// Repositories only: turn the opaque `Tx` from TransactionRunner.run back into a Prisma client.
import type { AppPrisma, TxClient } from './prisma.client.js';
import { TxRegistry, type Tx } from './tx-registry.js';

/** Shared by TransactionRunner (binds) and repositories (resolve). */
export const txRegistry = new TxRegistry<TxClient>();

/** The transaction client when called inside `run` with its token, the app client otherwise. */
export function clientFor(prisma: AppPrisma, tx?: Tx): AppPrisma | TxClient {
  return tx === undefined ? prisma : txRegistry.resolve(tx);
}
