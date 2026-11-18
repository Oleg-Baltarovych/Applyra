// Browser navigation seam: full-page redirects (OAuth) go through here so tests can observe them.
export const browser = {
  origin: (): string => window.location.origin,
  assign: (url: string): void => window.location.assign(url),
};
