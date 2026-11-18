// Browser seam: full-page redirects (OAuth) and the device time zone go through here so tests can control them.
export const browser = {
  origin: (): string => window.location.origin,
  assign: (url: string): void => window.location.assign(url),
  /** IANA zone of the device (unvalidated: engines may return offsets or odd ids). */
  timeZone: (): string => Intl.DateTimeFormat().resolvedOptions().timeZone,
};
