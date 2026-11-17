import { describe, expect, it } from 'vitest';
import { defineFactory, resetFactories } from './factory.js';
import { createRng } from './rng.js';

interface Thing {
  readonly name: string;
  readonly score: number;
}

const thing = (seed?: number) =>
  defineFactory<Thing>({
    seed,
    build: ({ seq, rng }) => ({ name: `thing-${String(seq)}`, score: rng.int(0, 1_000_000) }),
  });

describe('createRng', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = [a.next(), a.next(), a.next()];

    expect([b.next(), b.next(), b.next()]).toEqual(seqA);
    expect([c.next(), c.next(), c.next()]).not.toEqual(seqA);
    for (const value of seqA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int() stays within the inclusive bounds and pick() returns an element', () => {
    const rng = createRng(7);
    const ints = Array.from({ length: 200 }, () => rng.int(3, 5));

    expect(new Set(ints)).toEqual(new Set([3, 4, 5]));
    expect(['a', 'b']).toContain(rng.pick(['a', 'b']));
    expect(() => rng.pick([])).toThrow();
  });
});

describe('defineFactory', () => {
  it('same seed ⇒ same buildList', () => {
    expect(thing(1).buildList(3)).toEqual(thing(1).buildList(3));
  });

  it('different seeds ⇒ different data', () => {
    expect(thing(1).buildList(3)).not.toEqual(thing(2).buildList(3));
  });

  it('overrides win over built values', () => {
    expect(thing().build({ name: 'fixed' }).name).toBe('fixed');
    expect(
      thing()
        .buildList(2, { score: 5 })
        .map((t) => t.score),
    ).toEqual([5, 5]);
  });

  it('seq increments per build and reset() restarts it together with the rng', () => {
    const factory = thing();
    const first = factory.buildList(2);

    expect(first.map((t) => t.name)).toEqual(['thing-1', 'thing-2']);
    factory.reset();
    expect(factory.buildList(2)).toEqual(first);
  });

  it('resetFactories() resets every defined factory', () => {
    const factory = thing();
    const first = factory.build();
    factory.build();

    resetFactories();
    expect(factory.build()).toEqual(first);
  });

  it('a persistent factory builds then persists the value', async () => {
    const saved: Thing[] = [];
    const factory = defineFactory<Thing, { id: string }, Thing[]>({
      build: ({ seq }) => ({ name: `p-${String(seq)}`, score: 0 }),
      persist: (db, value) => {
        db.push(value);
        return Promise.resolve({ id: value.name });
      },
    });

    await expect(factory.create(saved, { score: 9 })).resolves.toEqual({ id: 'p-1' });
    expect(saved).toEqual([{ name: 'p-1', score: 9 }]);
  });
});
