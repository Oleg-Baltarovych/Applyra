import { IanaTimeZone } from '@applyra/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { meQuery } from '@/features/auth';
import { browser } from '@/lib/browser';
import { useUpdateSettings } from '../api/settings';

/**
 * First sign-in (10 §3, AC 9): while `settings.timezoneConfirmed` is false, push the device zone once without asking.
 * The server flips `timezoneConfirmed` on any PATCH with `timezone`, so later sessions (and other devices) skip this.
 * Best effort: a failed PATCH is not shown (401 is handled globally); the next session tries again.
 */
export function useBrowserTimezoneSync(): void {
  const { data } = useQuery(meQuery);
  const { mutate } = useUpdateSettings();
  // StrictMode runs the effect twice on mount; the PATCH is idempotent, but one request is enough.
  const sent = useRef(false);
  const confirmed = data?.settings.timezoneConfirmed;

  useEffect(() => {
    if (confirmed !== false || sent.current) return;
    const zone = IanaTimeZone.safeParse(browser.timeZone());
    if (!zone.success) return;
    sent.current = true;
    mutate({ timezone: zone.data });
  }, [confirmed, mutate]);
}
