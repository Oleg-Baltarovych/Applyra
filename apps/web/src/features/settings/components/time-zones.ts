/**
 * Time zone picker options: `Intl.supportedValuesOf('timeZone')` + `UTC` + the stored value (V8 omits `UTC` and links
 * such as `Europe/Kiev`, CONTEXT M0-11), sorted, without duplicates.
 */
export function timeZoneOptions(current: string): string[] {
  return [...new Set([...Intl.supportedValuesOf('timeZone'), 'UTC', current])].sort();
}
