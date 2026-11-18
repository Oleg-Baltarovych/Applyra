import { type Me, UpdateUserSettings } from '@applyra/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meQuery } from '@/features/auth';
import { browser } from '@/lib/browser';
import { API, buildMe, meSignedIn } from '../../../../test/msw/handlers';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/support/render';
import { useBrowserTimezoneSync } from './useBrowserTimezoneSync';

afterEach(() => vi.restoreAllMocks());

/** Records PATCH /me/settings bodies; answers like the API (timezone → timezoneConfirmed: true) or with `status`. */
function patchSettingsSpy(me: Me, status = 200) {
  const bodies: unknown[] = [];
  server.use(
    http.patch(`${API}/me/settings`, async ({ request }) => {
      const body = UpdateUserSettings.parse(await request.json());
      bodies.push(body);
      if (status !== 200) {
        return HttpResponse.json(
          {
            statusCode: status,
            code: 'INTERNAL_ERROR',
            message: 'x',
            requestId: 'r',
            details: null,
          },
          { status },
        );
      }
      return HttpResponse.json({ ...me.settings, ...body, timezoneConfirmed: true });
    }),
  );
  return bodies;
}

function renderSync(me: Me) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(meQuery.queryKey, me);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  // RTL's option (not a <StrictMode> wrapper, which does not double-run effects here) = main.tsx's StrictMode root.
  renderHook(() => useBrowserTimezoneSync(), { wrapper, reactStrictMode: true });
  return queryClient;
}

/**
 * Mutations started by the hook. Effects run synchronously inside renderHook's act() and `mutate` registers the
 * mutation at once, so right after render this is the final count — a positive signal instead of a sleep.
 */
const mutations = (queryClient: QueryClient) => queryClient.getMutationCache().getAll();

describe('useBrowserTimezoneSync (first sign-in, AC 9)', () => {
  it('sends the browser zone once (StrictMode double effect included) and updates the me cache', async () => {
    vi.spyOn(browser, 'timeZone').mockReturnValue('Europe/Berlin');
    const me = buildMe({ settings: { timezone: 'UTC', timezoneConfirmed: false } });
    const bodies = patchSettingsSpy(me);
    const queryClient = renderSync(me);
    expect(mutations(queryClient)).toHaveLength(1);

    await vi.waitFor(() =>
      expect(queryClient.getQueryData(meQuery.queryKey)?.settings).toMatchObject({
        timezone: 'Europe/Berlin',
        timezoneConfirmed: true,
      }),
    );
    expect(bodies).toEqual([{ timezone: 'Europe/Berlin' }]);
  });

  it('does not retry or loop when the PATCH fails, and leaves the cache unconfirmed', async () => {
    vi.spyOn(browser, 'timeZone').mockReturnValue('Europe/Berlin');
    const me = buildMe({ settings: { timezoneConfirmed: false } });
    const bodies = patchSettingsSpy(me, 500);
    const queryClient = renderSync(me);

    await vi.waitFor(() => expect(mutations(queryClient)[0]?.state.status).toBe('error'));
    expect(mutations(queryClient)).toHaveLength(1);
    expect(bodies).toHaveLength(1);
    expect(queryClient.getQueryData(meQuery.queryKey)?.settings.timezoneConfirmed).toBe(false);
  });

  it('does nothing once the timezone is confirmed', () => {
    vi.spyOn(browser, 'timeZone').mockReturnValue('Europe/Berlin');
    const me = buildMe({ settings: { timezoneConfirmed: true } });
    patchSettingsSpy(me);
    expect(mutations(renderSync(me))).toEqual([]);
  });

  it.each(['+02:00', 'Not/AZone', ''])(
    'skips a browser zone that is not a valid IANA id (%j)',
    (zone) => {
      vi.spyOn(browser, 'timeZone').mockReturnValue(zone);
      const me = buildMe({ settings: { timezoneConfirmed: false } });
      patchSettingsSpy(me);
      expect(mutations(renderSync(me))).toEqual([]);
    },
  );

  it('runs in the signed-in shell: one PATCH with the browser zone on any page', async () => {
    vi.spyOn(browser, 'timeZone').mockReturnValue('Europe/Berlin');
    const me = buildMe({ settings: { timezone: 'UTC', timezoneConfirmed: false } });
    server.use(meSignedIn(me));
    const bodies = patchSettingsSpy(me);
    const app = renderApp('/applications');
    await screen.findByRole('heading', { name: 'Applications', level: 1 });

    await vi.waitFor(() =>
      expect(app.queryClient.getQueryData(meQuery.queryKey)?.settings.timezoneConfirmed).toBe(true),
    );
    expect(app.queryClient.getMutationCache().getAll()).toHaveLength(1);
    expect(bodies).toEqual([{ timezone: 'Europe/Berlin' }]);
  });
});
