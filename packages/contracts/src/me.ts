// GET /me + PATCH /me/settings (06-api.md §7.1, FR-PROF-01). Shared with the web settings form (M0-12).
import { z } from 'zod';

/** True when the engine knows the zone. ECMAScript Intl (not a Node/browser API): RangeError for an unknown one. */
function isKnownTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * IANA time zone id, stored as sent (06 §7.1): engines disagree on canonical names (V8 maps the link `Europe/Kyiv` to
 * `Europe/Kiev`, Firefox does not), so neither case nor aliases are rewritten — clients send ids from `Intl` or the
 * picker. Only `utc` in any case becomes `UTC` (the DB default spelling). The pattern rejects offset strings
 * (`+02:00`), which newer ECMA-402 engines accept as `timeZone`; `Intl.supportedValuesOf('timeZone')` is not used
 * because V8 omits `UTC` and links.
 */
export const IanaTimeZone = z
  .string()
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/, 'Invalid IANA time zone')
  .refine(isKnownTimeZone, 'Unknown IANA time zone')
  .transform((zone) => (zone.toLowerCase() === 'utc' ? 'UTC' : zone));
export type IanaTimeZone = z.infer<typeof IanaTimeZone>;

/** Inclusive bounds = DB CHECK `user_settings_ranges_chk` (05-data-model.md §7.4). */
export const STALE_DAYS_LIMITS = {
  staleFollowUpDays: { min: 1, max: 90 },
  staleDaysAfterInterview: { min: 1, max: 90 },
  staleGhostDays: { min: 1, max: 180 },
} as const;

const staleDays = (field: keyof typeof STALE_DAYS_LIMITS) =>
  z.int().min(STALE_DAYS_LIMITS[field].min).max(STALE_DAYS_LIMITS[field].max);

/** Response shape (wire schema: no transforms). */
export const UserSettings = z.strictObject({
  timezone: z.string(),
  /** False until the user (or the web on first sign-in) sets `timezone` via PATCH; then the browser zone is not pushed. */
  timezoneConfirmed: z.boolean(),
  staleFollowUpDays: staleDays('staleFollowUpDays'),
  staleDaysAfterInterview: staleDays('staleDaysAfterInterview'),
  staleGhostDays: staleDays('staleGhostDays'),
  hotkeysEnabled: z.boolean(),
});
export type UserSettings = z.infer<typeof UserSettings>;

/** PATCH /me/settings body: a non-empty subset; unknown keys (incl. `userId`, `timezoneConfirmed`) are rejected. */
export const UpdateUserSettings = z
  .strictObject({
    timezone: IanaTimeZone.optional(),
    staleFollowUpDays: staleDays('staleFollowUpDays').optional(),
    staleDaysAfterInterview: staleDays('staleDaysAfterInterview').optional(),
    staleGhostDays: staleDays('staleGhostDays').optional(),
    hotkeysEnabled: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'At least one field is required' });
export type UpdateUserSettings = z.infer<typeof UpdateUserSettings>;

export const MeUser = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type MeUser = z.infer<typeof MeUser>;

export const Me = z.strictObject({ user: MeUser, settings: UserSettings });
export type Me = z.infer<typeof Me>;
