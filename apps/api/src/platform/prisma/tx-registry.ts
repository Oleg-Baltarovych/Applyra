// Opaque transaction tokens (M0-08): services receive a `Tx` from TransactionRunner.run and pass it to repositories;
// only platform/prisma can turn it back into the transaction client. A token is valid only while its transaction
// callback runs — a leaked token (used after commit/rollback) throws instead of silently running outside the tx.
// Nesting is rejected: a `run` inside `run` would open a second, independent transaction (and connection).
import { AsyncLocalStorage } from 'node:async_hooks';

declare const txBrand: unique symbol;
/** Opaque handle of a running transaction; carries no client API. */
export interface Tx {
  readonly [txBrand]: true;
}

export class TxRegistry<C> {
  readonly #clients = new WeakMap<Tx, C>();
  readonly #current = new AsyncLocalStorage<Tx>();

  /** True while the caller's async context is inside a `scope` callback. */
  inScope(): boolean {
    return this.#current.getStore() !== undefined;
  }

  /** Runs `fn` with a fresh frozen token bound to `client`; the binding is removed when `fn` settles. */
  async scope<T>(client: C, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (this.inScope())
      throw new Error('nested transaction: pass the outer Tx instead of calling run again');
    // The brand exists only at the type level; a frozen empty object is the whole runtime token.
    const tx = Object.freeze({}) as Tx;
    this.#clients.set(tx, client);
    try {
      return await this.#current.run(tx, () => fn(tx));
    } finally {
      this.#clients.delete(tx);
    }
  }

  resolve(tx: Tx): C {
    const client = this.#clients.get(tx);
    if (client === undefined) throw new Error('Tx used outside its transaction');
    return client;
  }
}
