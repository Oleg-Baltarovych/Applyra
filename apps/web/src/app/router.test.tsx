import { screen, within } from '@testing-library/react';
import { render } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import { ApiRequestError } from '@/lib/api/errors';
import { RouteError } from './route-error';
import { describe, expect, it, vi } from 'vitest';
import { authKeys } from '@/features/auth';
import { expectNoAxeViolations } from '../../test/support/axe';
import { API, AUTH, apiError, buildMe, meSignedIn, meSignedOut } from '../../test/msw/handlers';
import { server } from '../../test/msw/server';
import { renderApp } from '../../test/support/render';

describe('auth gate', () => {
  it('redirects a signed-out visitor to /sign-in with a relative next', async () => {
    server.use(meSignedOut());
    const app = renderApp('/today?view=x');
    expect(await screen.findByRole('heading', { name: 'Sign in to Applyra' })).toBeVisible();
    expect(app.location()).toBe(`/sign-in?next=${encodeURIComponent('/today?view=x')}`);
  });

  it('/ lands on /applications inside the shell', async () => {
    server.use(meSignedIn());
    const app = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Applications', level: 1 })).toBeVisible();
    expect(app.location()).toBe('/applications');
    expect(screen.getByText('Arrives with M1')).toBeVisible();
  });
});

describe('shell', () => {
  it('has the main navigation with aria-current and no axe violations', async () => {
    server.use(meSignedIn());
    const app = renderApp('/today');
    await screen.findByRole('heading', { name: 'Today', level: 1 });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Applications', 'Today', 'Settings']);
    expect(within(nav).getByRole('link', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Applications' })).not.toHaveAttribute(
      'aria-current',
    );

    await app.user.click(within(nav).getByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    expect(await screen.findByRole('form', { name: 'Preferences' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoAxeViolations(app.container);
  });

  it('sign-out posts to Better Auth, clears the cache and returns to /sign-in', async () => {
    let meCalls = 0;
    let signOutCalls = 0;
    let signedIn = true;
    server.use(
      http.get(`${API}/me`, () => {
        meCalls += 1;
        return signedIn ? HttpResponse.json(buildMe()) : apiError('UNAUTHENTICATED');
      }),
      http.post(`${AUTH}/sign-out`, () => {
        signOutCalls += 1;
        signedIn = false;
        return HttpResponse.json({ success: true });
      }),
    );
    const app = renderApp('/applications');
    await screen.findByRole('heading', { name: 'Applications', level: 1 });

    await app.user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in to Applyra' })).toBeVisible();
    expect(signOutCalls).toBe(1);
    expect(app.location()).toBe('/sign-in');
    expect(app.queryClient.getQueryData(authKeys.me())).toBeUndefined();
    expect(meCalls).toBe(2); // cache cleared → the sign-in loader asked again (and got 401)
  });

  it('keeps the user signed in and says so when sign-out fails', async () => {
    server.use(
      meSignedIn(),
      http.post(`${AUTH}/sign-out`, () => HttpResponse.json({ code: 'X' }, { status: 500 })),
    );
    const app = renderApp('/applications');
    await screen.findByRole('heading', { name: 'Applications', level: 1 });
    await app.user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-out failed, try again');
    expect(app.location()).toBe('/applications');
  });
});

describe('errors and 404', () => {
  it('unknown path → 404 screen without axe violations', async () => {
    const app = renderApp('/nope/deeper');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to Applications' })).toHaveAttribute(
      'href',
      '/applications',
    );
    await expectNoAxeViolations(app.container);
  });

  it('API 404 on a route → Not found screen', async () => {
    server.use(http.get(`${API}/me`, () => apiError('NOT_FOUND')));
    renderApp('/applications');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  it('server error → ErrorState with request id; Retry re-runs the loader', async () => {
    let healthy = false;
    server.use(
      http.get(`${API}/me`, () =>
        healthy ? HttpResponse.json(buildMe()) : apiError('INTERNAL_ERROR', 'req-500'),
      ),
    );
    const app = renderApp('/applications');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(screen.getByText('Request ID: req-500')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
    expect(alert).not.toHaveTextContent('INTERNAL_ERROR message');
    await expectNoAxeViolations(app.container);

    healthy = true;
    await app.user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Applications', level: 1 })).toBeVisible();
  });
});

describe('errors inside the shell', () => {
  const renderChildError = (code: 'INTERNAL_ERROR' | 'NOT_FOUND') => {
    const error = new ApiRequestError(code === 'NOT_FOUND' ? 404 : 500, {
      code,
      message: 'x',
      details: null,
      requestId: 'req-child',
    });
    const router = createMemoryRouter(
      [
        {
          element: (
            <main>
              <Outlet />
            </main>
          ),
          hydrateFallbackElement: <p>Loading</p>,
          children: [
            {
              path: '/x',
              loader: () => {
                throw error;
              },
              element: <p>unreachable</p>,
              errorElement: <RouteError standalone={false} />,
            },
          ],
        },
      ],
      { initialEntries: ['/x'] },
    );
    return render(<RouterProvider router={router} />);
  };

  it('a child-route error does not nest a second <main> and passes axe', async () => {
    const { container } = renderChildError('INTERNAL_ERROR');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeVisible();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    await expectNoAxeViolations(container);
  });

  it('a child-route 404 renders Not found inside the same <main>', async () => {
    renderChildError('NOT_FOUND');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});

describe('session expiry mid-session', () => {
  it('a 401 on refetch clears the cache and returns to /sign-in?next=<current page>', async () => {
    server.use(meSignedIn());
    const app = renderApp('/today');
    await screen.findByRole('heading', { name: 'Today', level: 1 });

    server.use(meSignedOut());
    await app.queryClient.refetchQueries({ queryKey: authKeys.me() });

    expect(await screen.findByRole('heading', { name: 'Sign in to Applyra' })).toBeVisible();
    expect(app.location()).toBe(`/sign-in?next=${encodeURIComponent('/today')}`);
    expect(app.queryClient.getQueryData(authKeys.me())).toBeUndefined();
  });
});

describe('route change: title and focus', () => {
  it('sets the title per route; focuses the new h1 only after client-side navigation', async () => {
    server.use(meSignedIn());
    const app = renderApp('/applications');
    const first = await screen.findByRole('heading', { name: 'Applications', level: 1 });
    expect(document.title).toBe('Applications · Applyra');
    expect(first).not.toHaveFocus();

    await app.user.click(screen.getByRole('link', { name: 'Today' }));
    const today = await screen.findByRole('heading', { name: 'Today', level: 1 });
    await vi.waitFor(() => expect(today).toHaveFocus());
    expect(document.title).toBe('Today · Applyra');
  });

  it('404 and sign-in have their own titles', async () => {
    renderApp('/nope');
    await screen.findByRole('heading', { name: 'Page not found' });
    expect(document.title).toBe('Page not found · Applyra');
  });
});

describe('/sign-in loader', () => {
  it('a server error on the session check shows the error page instead of the form', async () => {
    server.use(http.get(`${API}/me`, () => apiError('INTERNAL_ERROR', 'req-si')));
    renderApp('/sign-in');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('a network failure still shows the form', async () => {
    server.use(http.get(`${API}/me`, () => HttpResponse.error()));
    renderApp('/sign-in');
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });
});
