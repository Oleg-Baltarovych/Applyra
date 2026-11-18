import { screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/format';
import { expectNoAxeViolations } from '../../../../test/support/axe';
import { AUTH, buildMe, meSignedIn, meSignedOut } from '../../../../test/msw/handlers';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/support/render';

// 23:30 UTC on 1 Nov is already 2 Nov in Kyiv: the date must follow the user's time zone, not UTC.
const me = buildMe({
  user: { name: 'Olena K', email: 'olena@example.com', createdAt: '2026-11-01T23:30:00.000Z' },
  settings: { timezone: 'Europe/Kyiv' },
});

describe('/settings/account', () => {
  it('shows name, email and member-since in the user time zone', async () => {
    server.use(meSignedIn(me));
    const app = renderApp('/settings/account');
    const section = await screen.findByRole('region', { name: 'Account' });
    expect(within(section).getByText('Olena K')).toBeVisible();
    expect(within(section).getByText('olena@example.com')).toBeVisible();
    // Locale = the runtime default (as in the browser); format.test.ts pins locales.
    const inKyiv = formatDate(me.user.createdAt, { timeZone: 'Europe/Kyiv' });
    expect(inKyiv).not.toBe(formatDate(me.user.createdAt, { timeZone: 'UTC' }));
    expect(within(section).getByText(inKyiv)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
    await expectNoAxeViolations(app.container);
  });

  it('signs out from the account page', async () => {
    let signedOut = false;
    server.use(
      meSignedIn(me),
      http.post(`${AUTH}/sign-out`, () => {
        signedOut = true;
        return HttpResponse.json({ success: true });
      }),
    );
    const app = renderApp('/settings/account');
    const section = await screen.findByRole('region', { name: 'Account' });
    server.use(meSignedOut());
    await app.user.click(within(section).getByRole('button', { name: 'Sign out' }));
    await expect.poll(app.location).toBe('/sign-in');
    expect(signedOut).toBe(true);
  });
});

describe('/settings', () => {
  it('opens the preferences tab inside the settings navigation', async () => {
    server.use(meSignedIn());
    const app = renderApp('/settings');
    await screen.findByRole('form', { name: 'Preferences' });
    expect(app.location()).toBe('/settings/preferences');
    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeVisible();
  });
});
