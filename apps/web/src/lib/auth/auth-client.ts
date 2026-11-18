// Better Auth client (same pin as the api). Only for /api/auth/* actions (sign-in, sign-out); the session itself
// is read from GET /api/v1/me (features/auth meQuery, 10 §4.2).
import { createAuthClient } from 'better-auth/client';
import { env } from '../env';

export const authClient = createAuthClient({
  baseURL: `${new URL(env.apiUrl).origin}/api/auth`,
  fetchOptions: { credentials: 'include' },
});
