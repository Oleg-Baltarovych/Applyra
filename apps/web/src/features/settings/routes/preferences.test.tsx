import { type Me, UpdateUserSettings, type ValidationIssue } from '@applyra/contracts';
import { screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { fakeColorScheme } from '../../../../test/support/color-scheme';
import { expectNoAxeViolations } from '../../../../test/support/axe';
import { API, buildMe, meSignedIn } from '../../../../test/msw/handlers';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/support/render';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

/** GET /me + PATCH /me/settings answering like the API; returns the received PATCH bodies. */
function settingsApi(me: Me = buildMe()) {
  const bodies: unknown[] = [];
  server.use(
    meSignedIn(me),
    http.patch(`${API}/me/settings`, async ({ request }) => {
      const body = UpdateUserSettings.parse(await request.json());
      bodies.push(body);
      const confirmed = 'timezone' in body ? { timezoneConfirmed: true } : {};
      return HttpResponse.json({ ...me.settings, ...body, ...confirmed });
    }),
  );
  return bodies;
}

async function openPreferences() {
  const app = renderApp('/settings/preferences');
  const form = await screen.findByRole('form', { name: 'Preferences' });
  return { app, form };
}

const save = () => screen.getByRole('button', { name: 'Save preferences' });
/** The status region exists from the start (live region); wait for its text. */
const expectSaved = () =>
  vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Preferences saved'));
const field = (name: string) => screen.getByRole('spinbutton', { name });

describe('/settings/preferences (AC 10)', () => {
  it('shows the saved values and keeps Save disabled until something changes', async () => {
    settingsApi(buildMe({ settings: { timezone: 'Europe/Kiev' } }));
    const { app } = await openPreferences();

    // V8 omits links such as Europe/Kiev from Intl.supportedValuesOf: the stored value is still offered.
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveValue('Europe/Kiev');
    expect(screen.getByRole('option', { name: 'UTC' })).toBeInTheDocument();
    expect(field('Follow up after (days)')).toHaveValue(7);
    expect(field('Follow up after an interview (days)')).toHaveValue(5);
    expect(field('Suggest "ghosted" after (days)')).toHaveValue(21);
    expect(screen.getByRole('switch', { name: 'Keyboard shortcuts' })).toBeChecked();
    expect(save()).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Preferences' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoAxeViolations(app.container);
  });

  it('sends only the changed fields and reports success', async () => {
    const bodies = settingsApi();
    const { app } = await openPreferences();
    const followUp = field('Follow up after (days)');
    await app.user.clear(followUp);
    await app.user.type(followUp, '14');
    await app.user.click(screen.getByRole('switch', { name: 'Keyboard shortcuts' }));
    await app.user.click(save());

    await expectSaved();
    expect(bodies).toEqual([{ staleFollowUpDays: 14, hotkeysEnabled: false }]);
    expect(followUp).toHaveValue(14);
    expect(save()).toBeDisabled(); // the saved values are the new baseline
  });

  it('sends a changed time zone', async () => {
    const bodies = settingsApi();
    const { app } = await openPreferences();
    await app.user.selectOptions(
      screen.getByRole('combobox', { name: 'Time zone' }),
      'Europe/Berlin',
    );
    await app.user.click(save());
    await expectSaved();
    expect(bodies).toEqual([{ timezone: 'Europe/Berlin' }]);
  });

  it('validates the contracts limits before sending', async () => {
    const bodies = settingsApi();
    const { app } = await openPreferences();
    const ghost = field('Suggest "ghosted" after (days)');
    expect(ghost).toHaveAccessibleDescription('1–180 days');
    await app.user.clear(ghost);
    await app.user.type(ghost, '500');
    await app.user.click(save());

    await expect.poll(() => ghost.getAttribute('aria-invalid')).toBe('true');
    expect(ghost).toHaveAccessibleDescription(/180/);
    expect(bodies).toEqual([]);
  });

  it('says what to enter when a day field is cleared, instead of sending it', async () => {
    const bodies = settingsApi();
    const { app } = await openPreferences();
    const followUp = field('Follow up after (days)');
    await app.user.clear(followUp);
    await app.user.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a whole number between 1 and 90',
    );
    expect(followUp).toHaveAttribute('aria-invalid', 'true');
    expect(followUp).not.toHaveAccessibleDescription(/nan|expected/i); // no raw Zod text
    expect(bodies).toEqual([]);
  });

  it('maps server VALIDATION_ERROR details to the fields', async () => {
    server.use(
      meSignedIn(),
      http.patch(`${API}/me/settings`, () => {
        const details: ValidationIssue[] = [
          { path: 'staleFollowUpDays', message: 'Rejected by server' },
        ];
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Invalid',
            requestId: 'r',
            details,
          },
          { status: 400 },
        );
      }),
    );
    const { app } = await openPreferences();
    const followUp = field('Follow up after (days)');
    await app.user.clear(followUp);
    await app.user.type(followUp, '9');
    await app.user.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('Rejected by server');
    expect(followUp).toHaveAttribute('aria-invalid', 'true');
    expect(followUp).toHaveAccessibleDescription(/Rejected by server/);
    expect(followUp).toHaveFocus();
    expect(screen.queryByText('Preferences saved')).not.toBeInTheDocument();
  });

  it('shows a form-level error for other failures and keeps the edits', async () => {
    server.use(
      meSignedIn(),
      http.patch(`${API}/me/settings`, () =>
        HttpResponse.json(
          { statusCode: 503, code: 'UNAVAILABLE', message: 'x', requestId: 'r', details: null },
          { status: 503 },
        ),
      ),
    );
    const { app, form } = await openPreferences();
    await app.user.click(screen.getByRole('switch', { name: 'Keyboard shortcuts' }));
    await app.user.click(save());
    expect(await within(form).findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.getByRole('switch', { name: 'Keyboard shortcuts' })).not.toBeChecked();
    expect(save()).toBeEnabled();
  });
});

describe('theme selector', () => {
  it('follows OS scheme changes only while System is selected', async () => {
    const scheme = fakeColorScheme(false);
    settingsApi();
    const { app } = await openPreferences();
    scheme.setDark(true);
    expect(document.documentElement).toHaveClass('dark');

    await app.user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(scheme.listenerCount()).toBe(0);
    scheme.setDark(false);
    scheme.setDark(true);
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('stores the choice on this device and applies it immediately', async () => {
    settingsApi();
    const { app } = await openPreferences();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await app.user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });
});
