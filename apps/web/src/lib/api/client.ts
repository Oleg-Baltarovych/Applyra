// The only HTTP client of the SPA (10 §6.3): base URL VITE_API_URL, cookies included, JSON in/out,
// responses validated with contracts schemas in every env (a mismatch rejects; Sentry reporting arrives with R1).
import { ApiError } from '@applyra/contracts';
import type { z } from 'zod';
import { env } from '../env';
import { ApiRequestError, NetworkError, ResponseShapeError } from './errors';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Query = Record<string, string | number | boolean | undefined>;

type BaseOptions = {
  method?: Method;
  /** Path below VITE_API_URL, starting with `/` (e.g. `/me`). */
  path: string;
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
};

function buildUrl(path: string, query: Query | undefined): string {
  const url = new URL(env.apiUrl + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function errorFrom(response: Response): Promise<ApiRequestError> {
  const fallback = {
    code: 'INTERNAL_ERROR',
    message: 'Unexpected server response',
    details: null,
    requestId: response.headers.get('X-Request-Id') ?? '',
  } as const;
  const json: unknown = await response.json().catch(() => undefined);
  const parsed = ApiError.safeParse(json);
  return new ApiRequestError(response.status, parsed.success ? parsed.data : fallback);
}

export function request<S extends z.ZodType>(
  options: BaseOptions & { schema: S },
): Promise<z.output<S>>;
export function request(options: BaseOptions & { schema?: undefined }): Promise<undefined>;
export async function request(options: BaseOptions & { schema?: z.ZodType }): Promise<unknown> {
  const { method = 'GET', path, query, body, signal, schema } = options;
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  };
  if (signal) init.signal = signal;
  if (body !== undefined) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), init);
  } catch (cause) {
    throw new NetworkError('Network request failed', { cause });
  }

  if (!response.ok) throw await errorFrom(response);
  if (!schema) return undefined;

  const json: unknown = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ResponseShapeError(`Unexpected response shape for ${method} ${path}`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
