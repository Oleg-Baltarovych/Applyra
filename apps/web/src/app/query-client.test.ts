import { describe, expect, it, vi } from 'vitest';
import { authKeys } from '../features/auth';
import { ApiRequestError, NetworkError, ResponseShapeError } from '../lib/api/errors';
import { createQueryClient, shouldRetry } from './query-client';

const apiError = (status: number) =>
  new ApiRequestError(status, {
    code: 'INTERNAL_ERROR',
    message: 'x',
    details: null,
    requestId: 'r',
  });

describe('shouldRetry', () => {
  it('retries network errors and 5xx at most twice', () => {
    for (const error of [new NetworkError('x'), apiError(500), apiError(503)]) {
      expect([0, 1, 2].map((n) => shouldRetry(n, error))).toEqual([true, true, false]);
    }
  });

  it('never retries 4xx, shape mismatches or unknown errors', () => {
    for (const error of [
      apiError(400),
      apiError(401),
      apiError(404),
      apiError(429),
      new ResponseShapeError('x'),
      new Error('x'),
    ]) {
      expect(shouldRetry(0, error)).toBe(false);
    }
  });
});

describe('createQueryClient', () => {
  it('applies the 10 §5.1 defaults', () => {
    const queries = createQueryClient().getDefaultOptions().queries;
    expect(queries).toMatchObject({ staleTime: 30_000, gcTime: 300_000, retry: shouldRetry });
  });
});

describe('session expiry (401 from any query or mutation)', () => {
  const setup = () => {
    const onUnauthenticated = vi.fn();
    const client = createQueryClient({ onUnauthenticated });
    return { client, onUnauthenticated };
  };
  const reject = (status: number) => () => Promise.reject(apiError(status));

  it('calls onUnauthenticated for a 401 query', async () => {
    const { client, onUnauthenticated } = setup();
    await client.fetchQuery({ queryKey: ['jobs'], queryFn: reject(401) }).catch(() => {});
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('calls onUnauthenticated for a 401 mutation', async () => {
    const { client, onUnauthenticated } = setup();
    await client
      .getMutationCache()
      .build(client, { mutationFn: reject(401) })
      .execute(undefined)
      .catch(() => {});
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('ignores other errors', async () => {
    const { client, onUnauthenticated } = setup();
    await client.fetchQuery({ queryKey: ['jobs'], queryFn: reject(403) }).catch(() => {});
    await client
      .fetchQuery({ queryKey: ['jobs2'], queryFn: reject(500), retry: false })
      .catch(() => {});
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('leaves the first /me 401 to the route loaders, but handles an expired session on refetch', async () => {
    const { client, onUnauthenticated } = setup();
    await client.fetchQuery({ queryKey: authKeys.me(), queryFn: reject(401) }).catch(() => {});
    expect(onUnauthenticated).not.toHaveBeenCalled();

    client.setQueryData(authKeys.me(), { signedIn: true });
    await client
      .fetchQuery({ queryKey: authKeys.me(), queryFn: reject(401), staleTime: 0 })
      .catch(() => {});
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });
});
