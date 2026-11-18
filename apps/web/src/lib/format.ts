// Display formatting via Intl (FR-PROF-01, 06 §1): dates in the user's time zone (UserSettings.timezone), never the
// machine's. `locale` undefined = the browser's locale; tests pass a fixed one.
export type DateFormatOptions = { timeZone: string; locale?: string | undefined };

const toDate = (value: string | Date): Date =>
  typeof value === 'string' ? new Date(value) : value;

/** `1 Nov 2026` (en-GB) / `Nov 1, 2026` (en-US). */
export function formatDate(value: string | Date, { timeZone, locale }: DateFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(toDate(value));
}

/** `1 Nov 2026, 23:30` (en-GB). */
export function formatDateTime(
  value: string | Date,
  { timeZone, locale }: DateFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(toDate(value));
}

export function formatNumber(
  value: number,
  { locale }: { locale?: string | undefined } = {},
): string {
  return new Intl.NumberFormat(locale).format(value);
}
