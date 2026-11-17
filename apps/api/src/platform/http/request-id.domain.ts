/** One value, 8–64 chars of [A-Za-z0-9-]: UUIDs and proxy/CDN ids pass; anything else could inject into logs. */
const VALID_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** The incoming X-Request-Id when it is a single valid value, otherwise a fresh id from `newId`. */
export function resolveRequestId(
  header: string | string[] | undefined,
  newId: () => string,
): string {
  return typeof header === 'string' && VALID_REQUEST_ID.test(header) ? header : newId();
}
