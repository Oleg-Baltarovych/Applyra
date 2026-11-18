import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { browser } from '@/lib/browser';
import { env } from '@/lib/env';
import { expectNoAxeViolations } from '../../../../test/support/axe';
import { AUTH, meSignedIn, meSignedOut } from '../../../../test/msw/handlers';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/support/render';

const SocialBody = z.object({ callbackURL: z.string() });

afterEach(() => {
  vi.restoreAllMocks();
  env.authGoogleEnabled = true; // vitest.config env value
});

describe('/sign-in errors (?error=)', () => {
  it.each([
    ['SIGNUP_CLOSED', 'Access is invite-only'],
    ['account_not_linked', 'Verify your email address in your Google account, then try again'],
    ['state_mismatch', 'Sign-in failed, try again'],
  ])('%s → "%s", then removes error from the URL', async (code, message) => {
    server.use(meSignedOut());
    const app = renderApp(`/sign-in?next=%2Ftoday&error=${code}&error_description=raw`);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    await vi.waitFor(() => expect(alert).toHaveFocus()); // announced by screen readers
    expect(document.body).not.toHaveTextContent(code);
    await vi.waitFor(() => expect(app.location()).toBe('/sign-in?next=%2Ftoday'));
    expect(screen.getByRole('alert')).toHaveTextContent(message); // still shown after the URL is cleaned
  });
});

describe('/sign-in with Google', () => {
  it('posts the absolute callback URLs and leaves for the provider URL', async () => {
    let body: unknown;
    server.use(
      meSignedOut(),
      http.post(`${AUTH}/sign-in/social`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          url: 'https://accounts.google.com/o/oauth2/auth?x=1',
          redirect: false,
        });
      }),
    );
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => {});
    const app = renderApp('/sign-in?next=%2Ftoday%3Fview%3Dx');
    await expectNoAxeViolations(
      (await screen.findByRole('heading', { name: 'Sign in to Applyra' })).closest('main') ??
        app.container,
    );

    await app.user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('button', { name: 'Redirecting to Google…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    await vi.waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?x=1'),
    );
    const origin = window.location.origin;
    expect(body).toEqual({
      provider: 'google',
      callbackURL: `${origin}/today?view=x`,
      errorCallbackURL: `${origin}/sign-in`,
      disableRedirect: true,
    });
  });

  it('never forwards an unsafe next', async () => {
    let callbackURL: string | undefined;
    server.use(
      meSignedOut(),
      http.post(`${AUTH}/sign-in/social`, async ({ request }) => {
        callbackURL = SocialBody.parse(await request.json()).callbackURL;
        return HttpResponse.json({ url: 'https://accounts.google.com/x', redirect: false });
      }),
    );
    vi.spyOn(browser, 'assign').mockImplementation(() => {});
    const app = renderApp('/sign-in?next=%2F%2Fevil.example');
    await app.user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    await vi.waitFor(() => expect(callbackURL).toBe(`${window.location.origin}/applications`));
  });

  it('shows the generic message when the request is rejected', async () => {
    server.use(
      meSignedOut(),
      http.post(`${AUTH}/sign-in/social`, () =>
        HttpResponse.json(
          { code: 'PROVIDER_NOT_FOUND', message: 'Provider not found' },
          { status: 404 },
        ),
      ),
    );
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => {});
    const app = renderApp('/sign-in');
    await app.user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in failed, try again');
    expect(document.body).not.toHaveTextContent('PROVIDER_NOT_FOUND');
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });

  it('without a configured method shows the README hint instead of a button', async () => {
    env.authGoogleEnabled = false;
    server.use(meSignedOut());
    renderApp('/sign-in');
    expect(await screen.findByText(/No sign-in method is configured/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'See the README to set up Google sign-in' }),
    ).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/github\.com\/.+#google-sign-in-local$/),
    );
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('a signed-in visitor goes straight to next', async () => {
    server.use(meSignedIn());
    const app = renderApp('/sign-in?next=%2Ftoday');
    expect(await screen.findByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    expect(app.location()).toBe('/today');
  });
});
