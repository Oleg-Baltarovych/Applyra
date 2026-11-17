import { describe, expect, it } from 'vitest';
import { ApiError, ErrorCode, errorStatus } from '../src/index.js';

const requestId = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('ApiError', () => {
  it('accepts a validation error with array details', () => {
    const body = {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [{ path: 'items.0.title', message: 'Required' }],
      requestId,
    };
    expect(ApiError.parse(body)).toEqual(body);
  });

  it('accepts other codes with object or null details', () => {
    const conflict = {
      statusCode: 409,
      code: 'CONFLICT_ACTIVE_APPLICATION',
      message: 'Active application exists',
      details: { existingApplicationId: requestId },
      requestId,
    };
    expect(ApiError.parse(conflict)).toEqual(conflict);
    expect(ApiError.safeParse({ ...conflict, details: null }).success).toBe(true);
  });

  it('requires array details for VALIDATION_ERROR and object/null for the rest', () => {
    const v = { statusCode: 400, code: 'VALIDATION_ERROR', message: 'x', requestId };
    expect(ApiError.safeParse({ ...v, details: null }).success).toBe(false);
    expect(ApiError.safeParse({ ...v, details: {} }).success).toBe(false);
    const nf = { statusCode: 404, code: 'NOT_FOUND', message: 'x', requestId };
    expect(ApiError.safeParse({ ...nf, details: [] }).success).toBe(false);
  });

  it('is strict: rejects extra keys, a missing details or an unknown code', () => {
    const nf = { statusCode: 404, code: 'NOT_FOUND', message: 'x', details: null, requestId };
    expect(ApiError.safeParse({ ...nf, stack: 'at x' }).success).toBe(false);
    expect(ApiError.safeParse({ ...nf, details: undefined }).success).toBe(false);
    expect(ApiError.safeParse({ ...nf, code: 'TEAPOT' }).success).toBe(false);
  });

  it('has a status for every code', () => {
    expect(Object.keys(errorStatus).sort()).toEqual([...ErrorCode.options].sort());
  });
});
