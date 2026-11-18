// Route loaders of the auth gate (10 §4.2). Loaders only prefetch into the Query cache; components read it.
import type { QueryClient } from '@tanstack/react-query';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { NetworkError, isApiRequestError } from '@/lib/api/errors';
import { safeNext } from '@/lib/auth/safe-next';
import { meQuery } from '../api/me';

/** Protected layout: no session (401) → /sign-in?next=<current relative path>; other errors → errorElement. */
export const requireSession =
  (queryClient: QueryClient) =>
  async ({ request }: LoaderFunctionArgs) => {
    try {
      await queryClient.ensureQueryData(meQuery);
      return null;
    } catch (error) {
      if (isApiRequestError(error) && error.status === 401) {
        const { pathname, search } = new URL(request.url);
        throw redirect(`/sign-in?next=${encodeURIComponent(pathname + search)}`);
      }
      throw error;
    }
  };

/**
 * /sign-in: an existing session goes straight to `next`. No session (401) or no network → show the page (the button
 * is the way on); any other failure (5xx, bad response) → errorElement, like every other route.
 */
export const redirectIfSignedIn =
  (queryClient: QueryClient) =>
  async ({ request }: LoaderFunctionArgs) => {
    const next = safeNext(new URL(request.url).searchParams.get('next'));
    try {
      await queryClient.fetchQuery({ ...meQuery, retry: false });
    } catch (error) {
      if ((isApiRequestError(error) && error.status === 401) || error instanceof NetworkError) {
        return null;
      }
      throw error;
    }
    throw redirect(next);
  };
