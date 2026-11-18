import { describe, expect, it } from 'vitest';
import { ApiRequestError, NetworkError, ResponseShapeError } from '../lib/api/errors';
import { describeError } from './error-message';

const apiError = (status: number, code: ApiRequestError['code'], requestId = 'req-9') =>
  new ApiRequestError(status, { code, message: 'server text', details: null, requestId });

describe('describeError', () => {
  it('API 404 → Not found, with the request id', () => {
    expect(describeError(apiError(404, 'NOT_FOUND'))).toEqual({
      title: 'Not found',
      message: 'This page or item does not exist.',
      requestId: 'req-9',
    });
  });

  it.each([
    [apiError(429, 'RATE_LIMITED'), 'Too many requests'],
    [apiError(503, 'UNAVAILABLE'), 'Service unavailable'],
    [apiError(500, 'INTERNAL_ERROR'), 'Something went wrong'],
    [new NetworkError('x'), 'Cannot reach the server'],
    [new ResponseShapeError('x'), 'Something went wrong'],
    [new Error('boom'), 'Something went wrong'],
    ['thrown string', 'Something went wrong'],
  ])('%o → %s, never the raw server text', (error, title) => {
    const described = describeError(error);
    expect(described.title).toBe(title);
    expect(described.message).not.toContain('server text');
  });

  it('carries no request id for non-API errors', () => {
    expect(describeError(new NetworkError('x')).requestId).toBeNull();
  });
});
