// User-facing text for an error, chosen by `code` (10 §7.1) — server `message` text is never shown verbatim.
import { ApiRequestError, NetworkError } from '../lib/api/errors';

export type DescribedError = { title: string; message: string; requestId: string | null };

const generic = { title: 'Something went wrong', message: 'Please try again.' };

export function describeError(error: unknown): DescribedError {
  if (error instanceof NetworkError) {
    return {
      title: 'Cannot reach the server',
      message: 'Check your connection and try again.',
      requestId: null,
    };
  }
  if (!(error instanceof ApiRequestError)) return { ...generic, requestId: null };
  const { requestId } = error;
  switch (error.code) {
    case 'NOT_FOUND':
      return { title: 'Not found', message: 'This page or item does not exist.', requestId };
    case 'RATE_LIMITED':
      return { title: 'Too many requests', message: 'Wait a moment and try again.', requestId };
    case 'UNAVAILABLE':
      return {
        title: 'Service unavailable',
        message: 'The service is temporarily down. Try again soon.',
        requestId,
      };
    default:
      return { ...generic, requestId };
  }
}
