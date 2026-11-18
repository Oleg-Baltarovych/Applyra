// Renders the real route tree in a memory router with a fresh QueryClient (no retry delay) per test.
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { createApp } from '@/app/create-app';
import { Providers } from '@/app/providers';

export function renderApp(path: string) {
  const { queryClient, router } = createApp((routes, client) => {
    const defaults = client.getDefaultOptions();
    client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retryDelay: 0 } });
    return createMemoryRouter(routes, { initialEntries: [path] });
  });
  const user = userEvent.setup();
  const view = render(
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  const location = () => router.state.location.pathname + router.state.location.search;
  return { ...view, router, queryClient, user, location };
}
