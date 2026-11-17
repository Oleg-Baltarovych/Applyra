// The only platform/prisma file services may import (rule 4): run work in one interactive transaction without
// exposing any Prisma API. Repositories get the client from the token via prisma-tx.ts `clientFor`.
import { Inject, Injectable } from '@nestjs/common';
import { PRISMA } from './prisma.constants.js';
import type { AppPrisma } from './prisma.client.js';
import { txRegistry } from './prisma-tx.js';
import type { Tx } from './tx-registry.js';

export type { Tx } from './tx-registry.js';

@Injectable()
export class TransactionRunner {
  constructor(@Inject(PRISMA) private readonly prisma: AppPrisma) {}

  /**
   * Commits when `fn` resolves, rolls back when it throws. The token is invalid after `run` settles.
   * A nested `run` (inside another `run`'s callback) is rejected before a second transaction is opened.
   */
  async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (txRegistry.inScope()) {
      throw new Error('nested transaction: pass the outer Tx instead of calling run again');
    }
    return this.prisma.$transaction((client) => txRegistry.scope(client, fn));
  }
}
