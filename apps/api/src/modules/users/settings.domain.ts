// UserSettings rules (FR-PROF-01). Pure: no Nest/Prisma.
import type { UpdateUserSettings } from '@applyra/contracts';

export type SettingsUpdate = UpdateUserSettings & { timezoneConfirmed?: true };

/**
 * The column update for a validated PATCH: setting `timezone` (even to the `UTC` default) marks it confirmed, so the
 * web stops pushing the browser zone (M0-11 Q1-A). Other fields never touch the flag; it is never reset.
 */
export function toSettingsUpdate(patch: UpdateUserSettings): SettingsUpdate {
  return patch.timezone === undefined ? { ...patch } : { ...patch, timezoneConfirmed: true };
}
