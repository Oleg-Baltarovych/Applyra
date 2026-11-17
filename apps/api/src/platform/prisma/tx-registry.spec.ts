import { describe, expect, it } from 'vitest';
import { TxRegistry, type Tx } from './tx-registry.js';

interface FakeClient {
  readonly name: string;
}

describe('TxRegistry', () => {
  it('hands fn an opaque token that resolves to the transaction client while fn runs', async () => {
    const registry = new TxRegistry<FakeClient>();
    const client = { name: 'tx-1' };

    const result = await registry.scope(client, (tx) => {
      expect(registry.resolve(tx)).toBe(client);
      expect(Object.isFrozen(tx)).toBe(true);
      expect(Object.keys(tx)).toEqual([]); // no client surface on the token
      return Promise.resolve('done');
    });

    expect(result).toBe('done');
  });

  it('rejects a token used after its transaction finished', async () => {
    const registry = new TxRegistry<FakeClient>();
    const leaked = await registry.scope({ name: 'tx-1' }, (tx) => Promise.resolve(tx));

    expect(() => registry.resolve(leaked)).toThrow(/outside its transaction/);
  });

  it('unbinds the token when fn throws, and rethrows', async () => {
    const registry = new TxRegistry<FakeClient>();
    let leaked: Tx | undefined;

    await expect(
      registry.scope({ name: 'tx-1' }, (tx) => {
        leaked = tx;
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(leaked).toBeDefined();
    if (leaked) expect(() => registry.resolve(leaked as Tx)).toThrow(/outside its transaction/);
  });

  it('keeps concurrent transactions apart and rejects a token of another registry', async () => {
    const a = new TxRegistry<FakeClient>();
    const b = new TxRegistry<FakeClient>();
    const one = { name: 'tx-1' };
    const two = { name: 'tx-2' };
    let release: () => void = () => undefined;
    const bothOpen = new Promise<void>((resolve) => (release = resolve));
    const tokens: Tx[] = [];

    await Promise.all([
      a.scope(one, async (tx) => {
        tokens.push(tx);
        await bothOpen;
        expect(a.resolve(tx)).toBe(one);
      }),
      a.scope(two, (tx) => {
        tokens.push(tx);
        expect(a.resolve(tx)).toBe(two);
        expect(() => b.resolve(tx)).toThrow(/outside its transaction/);
        release();
        return Promise.resolve();
      }),
    ]);
    expect(tokens).toHaveLength(2);
  });

  it('rejects a nested scope while the outer transaction runs (no silent second transaction)', async () => {
    const registry = new TxRegistry<FakeClient>();
    let innerRan = false;

    await expect(
      registry.scope({ name: 'outer' }, () =>
        registry.scope({ name: 'inner' }, () => {
          innerRan = true;
          return Promise.resolve();
        }),
      ),
    ).rejects.toThrow(/nested/);
    expect(innerRan).toBe(false);
    // The outer scope finished; a new top-level scope works again.
    await expect(registry.scope({ name: 'next' }, () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('exposes whether the caller runs inside a scope', async () => {
    const registry = new TxRegistry<FakeClient>();
    expect(registry.inScope()).toBe(false);
    await registry.scope({ name: 'tx' }, () => {
      expect(registry.inScope()).toBe(true);
      return Promise.resolve();
    });
  });
});
