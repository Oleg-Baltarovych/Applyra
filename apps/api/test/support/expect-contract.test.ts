import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { expectContract } from './expect-contract.js';

const schema = z.object({
  id: z.string(),
  owner: z.object({ name: z.string() }),
  tags: z.array(z.object({ label: z.string() })),
});

const body = { id: 'j1', owner: { name: 'A' }, tags: [{ label: 'x' }] };
const json = { 'content-type': 'application/json; charset=utf-8' };

function res(
  overrides: Partial<{ status: number; headers: Record<string, string>; body: unknown }> = {},
) {
  return { status: 200, headers: json, body, ...overrides };
}

describe('expectContract', () => {
  it('passes and returns the typed body', () => {
    const data = expectContract(res(), 200, schema);

    expect(data).toEqual(body);
    expect(data.owner.name).toBe('A');
  });

  it('fails on a different status', () => {
    expect(() => expectContract(res({ status: 201 }), 200, schema)).toThrow();
  });

  it('fails on a non-JSON content type', () => {
    expect(() =>
      expectContract(res({ headers: { 'content-type': 'text/html' } }), 200, schema),
    ).toThrow();
    expect(() => expectContract(res({ headers: {} }), 200, schema)).toThrow();
  });

  it('fails on a missing field with the schema error', () => {
    const withoutId = { owner: body.owner, tags: body.tags };

    expect(() => expectContract(res({ body: withoutId }), 200, schema)).toThrow(/id/);
  });

  it.each([
    ['top level', { ...body, extra: 1 }],
    ['nested object', { ...body, owner: { name: 'A', email: 'a@x' } }],
    ['array item', { ...body, tags: [{ label: 'x', secret: true }] }],
  ])('fails on an unknown key at the %s', (_where, withExtra) => {
    expect(() => expectContract(res({ body: withExtra }), 200, schema)).toThrow();
  });
});
