// Session source (10 §4.2): GET /api/v1/me — 401 means signed out; also lazily creates the settings row.
import { Me } from '@applyra/contracts';
import { queryOptions } from '@tanstack/react-query';
import { request } from '@/lib/api/client';
import { authKeys } from './keys';

export const meQuery = queryOptions({
  queryKey: authKeys.me(),
  queryFn: ({ signal }) => request({ path: '/me', schema: Me, signal }),
});
