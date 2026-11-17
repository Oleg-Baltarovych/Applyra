// Branches unreachable over a real socket (Node's HTTP parser rejects a non-numeric Content-Length first).
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { authBodyLimit } from './auth-body-limit.js';

function run(path: string, headers: Record<string, string>) {
  const req = { originalUrl: path, headers, id: 'req-12345678' } as unknown as Request; // minimal fake: only the fields the middleware reads
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    setHeader: vi.fn(),
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  } as unknown as Response; // minimal fake: status/json/setHeader only
  const next = vi.fn() as NextFunction;
  authBodyLimit(req, res, next);
  return { sent, next };
}

describe('authBodyLimit', () => {
  it('answers a non-numeric Content-Length on /api/auth with 400 VALIDATION_ERROR', () => {
    const { sent, next } = run('/api/auth/sign-in/social', { 'content-length': '12abc' });
    expect(next).not.toHaveBeenCalled();
    expect(sent).toMatchObject({
      status: 400,
      body: { code: 'VALIDATION_ERROR', requestId: 'req-12345678' },
    });
  });

  it('answers a declared Content-Length over 1 MB with 413', () => {
    const { sent } = run('/api/auth', { 'content-length': String(1024 * 1024 + 1) });
    expect(sent).toMatchObject({ status: 413, body: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it.each([
    ['a non-auth path', '/api/v1/jobs', { 'content-length': 'nope' }],
    ['a look-alike prefix', '/api/authx', { 'content-length': '99999999' }],
    ['a body-less auth request', '/api/auth/get-session', {}],
  ])('passes %s through', (_label, path, headers) => {
    expect(run(path, headers).next).toHaveBeenCalledOnce();
  });
});
