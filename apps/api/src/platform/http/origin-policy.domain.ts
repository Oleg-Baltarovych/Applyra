// CSRF + content-type policy for non-auth mutations (09-security-privacy.md §3).

export interface MutationRequest {
  method: string;
  /** The Origin header as sent (compared exactly, no normalisation). */
  origin: string | undefined;
  /** The request carries a body (Content-Length > 0 or Transfer-Encoding). */
  hasBody: boolean;
  contentType: string | undefined;
  /** The handler is marked @AcceptsMultipart(). */
  acceptsMultipart: boolean;
}

export type MutationCheck = 'ok' | 'CSRF_ORIGIN' | 'UNSUPPORTED_MEDIA_TYPE';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const mediaType = (contentType: string): string =>
  (contentType.split(';')[0] ?? '').trim().toLowerCase();

/** Origin first (missing or ≠ webOrigin → CSRF_ORIGIN), then JSON-only bodies (multipart only when allowed). */
export function checkMutation(req: MutationRequest, webOrigin: string): MutationCheck {
  if (!MUTATIONS.has(req.method.toUpperCase())) return 'ok';
  if (req.origin !== webOrigin) return 'CSRF_ORIGIN';
  if (!req.hasBody) return 'ok';
  const type = req.contentType === undefined ? '' : mediaType(req.contentType);
  if (type === 'application/json') return 'ok';
  if (req.acceptsMultipart && type === 'multipart/form-data') return 'ok';
  return 'UNSUPPORTED_MEDIA_TYPE';
}
