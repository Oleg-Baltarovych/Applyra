import type { QueryClient } from '@tanstack/react-query';
import { type RouteObject, redirect } from 'react-router';
import { DelayedSkeleton } from '@/components/DelayedSkeleton';
import { ApplicationsPlaceholder } from '@/features/applications';
import { SignInPage, redirectIfSignedIn, requireSession } from '@/features/auth';
import { SettingsPage } from '@/features/settings';
import { AppShell } from '@/features/shell';
import { TodayPlaceholder } from '@/features/today';
import { DEFAULT_LANDING } from '@/lib/auth/safe-next';
import { NotFound } from './not-found';
import { RootLayout, type RouteHandle } from './root-layout';
import { RouteError } from './route-error';

const title = (value: string): RouteHandle => ({ title: value });
/** Child of the shell: errors render inside the shell's <main>. */
const inShell = <RouteError standalone={false} />;

/** Route tree (10 §2.1, §4.2) — shared by createBrowserRouter (main.tsx) and createMemoryRouter (tests). */
export function createRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      id: 'root',
      element: <RootLayout />,
      errorElement: <RouteError />,
      hydrateFallbackElement: <DelayedSkeleton />,
      children: [
        {
          path: '/sign-in',
          loader: redirectIfSignedIn(queryClient),
          element: <SignInPage />,
          handle: title('Sign in'),
        },
        {
          id: 'protected',
          path: '/',
          loader: requireSession(queryClient),
          element: <AppShell />,
          errorElement: <RouteError />,
          children: [
            { index: true, loader: () => redirect(DEFAULT_LANDING) },
            {
              path: 'applications',
              element: <ApplicationsPlaceholder />,
              errorElement: inShell,
              handle: title('Applications'),
            },
            {
              path: 'today',
              element: <TodayPlaceholder />,
              errorElement: inShell,
              handle: title('Today'),
            },
            {
              path: 'settings',
              element: <SettingsPage />,
              errorElement: inShell,
              handle: title('Settings'),
            },
          ],
        },
        { path: '*', element: <NotFound />, handle: title('Page not found') },
      ],
    },
  ];
}
