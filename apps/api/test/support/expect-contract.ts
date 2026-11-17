import { expect } from 'vitest';
import { z } from 'zod';

/** The parts of a Supertest response a contract check needs. */
export interface ContractResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

/**
 * Asserts an HTTP response against its contract: exact status, JSON content type, body valid for `schema`
 * AND no key the schema does not declare, at any depth (Zod strips unknown keys, so the parsed value must
 * deep-equal the raw body — a `.strict()` on the top level alone would miss nested objects / array items).
 *
 * Response schemas are wire schemas: no transforms or defaults, otherwise parsed ≠ body by design. They must
 * also be closed: no `z.looseObject` / `.passthrough()` / `z.record` / `z.unknown()` / `z.any()` for fields the
 * contract models — those let any extra key through this check unnoticed.
 * Returns the parsed, typed body.
 */
export function expectContract<S extends z.ZodType>(
  res: ContractResponse,
  status: number,
  schema: S,
): z.output<S> {
  expect(res.status, 'HTTP status').toBe(status);
  expect(res.headers['content-type'] ?? '', 'content-type').toMatch(/^application\/json/);

  const parsed = schema.safeParse(res.body);
  if (!parsed.success) {
    throw new Error(`response body does not match the contract:\n${z.prettifyError(parsed.error)}`);
  }
  expect(parsed.data, 'response body has keys the contract does not declare').toStrictEqual(
    res.body,
  );
  return parsed.data;
}
