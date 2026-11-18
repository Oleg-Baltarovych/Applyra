// TanStack Query defaults (10 §5.1): staleTime 30 s, gcTime 5 min, retry ≤ 2 only for network errors and 5xx.
// A 401 from any query/mutation mid-session = expired session → `onUnauthenticated` (10 §6.3).
import { MutationCache, type Query, QueryCache, QueryClient } from '@tanstack/react-query';
import { authKeys } from '../features/auth';
import { ApiRequestError, NetworkError, isApiRequestError } from '../lib/api/errors';

const MAX_RETRIES = 2;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (error instanceof NetworkError) return true;
  return error instanceof ApiRequestError && error.status >= 500;
}

const isUnauthenticated = (error: unknown) => isApiRequestError(error) && error.status === 401;
const meKey = JSON.stringify(authKeys.me());

/** The first /me 401 (no session yet) is the route loaders' job (redirect with `next`); everything else is expiry. */
const loaderOwned = (query: Query<unknown, unknown, unknown>) =>
  query.queryHash === meKey && query.state.data === undefined;

export function createQueryClient(options: { onUnauthenticated?: () => void } = {}): QueryClient {
  const expired = (error: unknown) => {
    if (isUnauthenticated(error)) options.onUnauthenticated?.();
  };
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!loaderOwned(query)) expired(error);
      },
    }),
    mutationCache: new MutationCache({ onError: expired }),
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 300_000, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}
