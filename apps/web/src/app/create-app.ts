// Composition root shared by main.tsx (browser router) and tests (memory router): QueryClient + router, wired so
// an expired session (401 mid-session) clears the cache and returns to /sign-in?next=<where the user was>.
import type { QueryClient } from '@tanstack/react-query';
import type { RouteObject, createMemoryRouter } from 'react-router';
import { safeNext } from '@/lib/auth/safe-next';
import { createQueryClient } from './query-client';
import { createRoutes } from './router';

/** Both createBrowserRouter and createMemoryRouter return this DataRouter type. */
export type AppRouter = ReturnType<typeof createMemoryRouter>;

export function sessionExpired(queryClient: QueryClient, router: AppRouter): void {
  const { pathname, search } = router.state.location;
  if (pathname === '/sign-in') return;
  queryClient.clear();
  void router.navigate(`/sign-in?next=${encodeURIComponent(safeNext(pathname + search))}`, {
    replace: true,
  });
}

/** `createRouter` gets the QueryClient too: a data router starts its loaders on creation (tests tune defaults first). */
export function createApp(
  createRouter: (routes: RouteObject[], queryClient: QueryClient) => AppRouter,
) {
  // The QueryClient's 401 handler needs the router, which is created from the QueryClient's routes.
  const holder: { router?: AppRouter } = {};
  const queryClient = createQueryClient({
    onUnauthenticated: () => {
      if (holder.router) sessionExpired(queryClient, holder.router);
    },
  });
  const router = createRouter(createRoutes(queryClient), queryClient);
  holder.router = router;
  return { queryClient, router };
}
