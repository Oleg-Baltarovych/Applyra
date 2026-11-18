import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { server } from '../../../test/msw/server';
import { request } from './client';
import { ApiRequestError, NetworkError, ResponseShapeError } from './errors';

const API = 'http://localhost:3000/api/v1';
const Thing = z.strictObject({ id: z.string(), n: z.number() });

describe('request', () => {
  it('sends credentials and JSON, returns the parsed body', async () => {
    // In Node, MSW sees the request at the socket level (no `credentials`): a pass-through spy reads the init.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let seen: { contentType: string | null; body: unknown; q: string } | undefined;
    server.use(
      http.post(`${API}/things`, async ({ request: req }) => {
        seen = {
          contentType: req.headers.get('content-type'),
          body: await req.json(),
          q: new URL(req.url).searchParams.get('q') ?? '',
        };
        return HttpResponse.json({ id: 'a', n: 1 }, { status: 201 });
      }),
    );

    const result = await request({
      method: 'POST',
      path: '/things',
      query: { q: 'x y' },
      body: { n: 1 },
      schema: Thing,
    });

    expect(result).toEqual({ id: 'a', n: 1 });
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
    fetchSpy.mockRestore();
    expect(seen).toEqual({
      contentType: 'application/json',
      body: { n: 1 },
      q: 'x y',
    });
  });

  it('GET carries no body and no content-type', async () => {
    let contentType: string | null = 'unset';
    server.use(
      http.get(`${API}/things/a`, ({ request: req }) => {
        contentType = req.headers.get('content-type');
        return HttpResponse.json({ id: 'a', n: 2 });
      }),
    );
    await expect(request({ path: '/things/a', schema: Thing })).resolves.toEqual({ id: 'a', n: 2 });
    expect(contentType).toBeNull();
  });

  it('204 without a schema resolves to undefined', async () => {
    server.use(http.delete(`${API}/things/a`, () => new HttpResponse(null, { status: 204 })));
    await expect(request({ method: 'DELETE', path: '/things/a' })).resolves.toBeUndefined();
  });

  it('rejects a 2xx body that does not match the schema', async () => {
    server.use(http.get(`${API}/things/a`, () => HttpResponse.json({ id: 'a' })));
    await expect(request({ path: '/things/a', schema: Thing })).rejects.toBeInstanceOf(
      ResponseShapeError,
    );
  });

  it('maps an API error body to ApiRequestError', async () => {
    server.use(
      http.patch(`${API}/things/a`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            requestId: 'req-1',
            details: [{ path: 'n', message: 'Too big' }],
          },
          { status: 400 },
        ),
      ),
    );
    const error = await request({
      method: 'PATCH',
      path: '/things/a',
      body: { n: 9 },
      schema: Thing,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      requestId: 'req-1',
      details: [{ path: 'n', message: 'Too big' }],
    });
  });

  it.each([
    [
      'non-JSON',
      502,
      () =>
        new HttpResponse('<html>Bad gateway</html>', {
          status: 502,
          headers: { 'X-Request-Id': 'r-2' },
        }),
    ],
    [
      'garbled JSON',
      503,
      () =>
        HttpResponse.json({ error: 'nope' }, { status: 503, headers: { 'X-Request-Id': 'r-2' } }),
    ],
  ])('maps a %s error body (%i) to INTERNAL_ERROR', async (_, status, respond) => {
    server.use(http.get(`${API}/things/a`, respond));
    const error = await request({ path: '/things/a', schema: Thing }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status,
      code: 'INTERNAL_ERROR',
      requestId: 'r-2',
      details: null,
    });
  });

  it('maps a network failure to NetworkError', async () => {
    server.use(http.get(`${API}/things/a`, () => HttpResponse.error()));
    await expect(request({ path: '/things/a', schema: Thing })).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});
