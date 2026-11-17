import { ApiError } from '@applyra/contracts';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppException } from './app-exception.js';
import { toApiError } from './error-mapping.domain.js';

const RID = 'req-12345678';

const map = (err: unknown) => {
  const result = toApiError(err, RID);
  // Every mapped body satisfies the public contract.
  expect(ApiError.parse(result.body)).toEqual(result.body);
  expect(result.body.requestId).toBe(RID);
  expect(result.body.statusCode).toBe(result.status);
  return result;
};

const zodError = () => {
  const parsed = z
    .object({ items: z.array(z.object({ title: z.string() })) })
    .safeParse({ items: [{ title: 1 }] });
  if (parsed.success) throw new Error('fixture must fail');
  return parsed.error;
};

const bodyParserError = (type: string, status: number) =>
  Object.assign(new Error('raw parser message with internals'), {
    type,
    status,
    statusCode: status,
    expose: true,
  });

describe('toApiError', () => {
  it('maps an AppException to its catalogue code and status', () => {
    const { status, body, log } = map(
      new AppException('CONFLICT_ACTIVE_APPLICATION', 'Active application exists', {
        existingApplicationId: 'a1',
      }),
    );
    expect(status).toBe(409);
    expect(body).toEqual({
      statusCode: 409,
      code: 'CONFLICT_ACTIVE_APPLICATION',
      message: 'Active application exists',
      details: { existingApplicationId: 'a1' },
      requestId: RID,
    });
    expect(log).toBe('none');
  });

  it('gives an AppException without details null details; 5xx codes are logged as errors', () => {
    const { body, log } = map(new AppException('UNAVAILABLE', 'Not ready'));
    expect(body).toMatchObject({ statusCode: 503, code: 'UNAVAILABLE', details: null });
    expect(log).toBe('error');
  });

  it('maps a nestjs-zod validation error to VALIDATION_ERROR with dot-joined paths', () => {
    const { status, body } = map(new ZodValidationException(zodError()));
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([{ path: 'items.0.title', message: expect.any(String) }]);
  });

  it('tolerates a validation exception without Zod issues', () => {
    const { body } = map(new ZodValidationException(new Error('not a ZodError')));
    expect(body).toMatchObject({ code: 'VALIDATION_ERROR', details: [] });
    const odd = { issues: [{ path: 'x', message: 1 }, 'junk'] };
    expect(map(new ZodValidationException(odd)).body.details).toEqual([
      { path: '', message: 'Invalid value' },
    ]);
  });

  it('maps a serialization error to a 500 that is logged', () => {
    const { status, body, log } = map(new ZodSerializationException(zodError()));
    expect(status).toBe(500);
    expect(body).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: null,
    });
    expect(log).toBe('error');
  });

  it.each([
    ['entity.too.large', 413, 'PAYLOAD_TOO_LARGE'],
    ['entity.parse.failed', 400, 'VALIDATION_ERROR'],
    ['charset.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['encoding.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ])('maps the body-parser error %s', (type, status, code) => {
    const { body } = map(bodyParserError(type, status));
    expect(body).toMatchObject({ statusCode: status, code });
    expect(body.message).not.toContain('internals');
  });

  it('reports malformed JSON at the body root', () => {
    expect(map(bodyParserError('entity.parse.failed', 400)).body.details).toEqual([
      { path: '', message: 'Malformed JSON' },
    ]);
  });

  it('maps any other body-parser error by its status (unmapped status → warned 500)', () => {
    expect(map(bodyParserError('request.aborted', 400)).body.code).toBe('VALIDATION_ERROR');
    const odd = map(bodyParserError('stream.encoding.set', 500));
    expect(odd).toMatchObject({
      status: 500,
      log: 'warn',
      body: { code: 'INTERNAL_ERROR', details: null },
    });
  });

  it.each([
    [new BadRequestException('Unexpected token } in JSON at position 1'), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new NotFoundException('Cannot GET /secret/path'), 404, 'NOT_FOUND'],
    [new HttpException('x', 413), 413, 'PAYLOAD_TOO_LARGE'],
    [new HttpException('x', 415), 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [new HttpException('x', 429), 429, 'RATE_LIMITED'],
    [new HttpException('x', 503), 503, 'UNAVAILABLE'],
  ])('maps HttpException %# by status without echoing its message', (err, status, code) => {
    const { body } = map(err);
    expect(body).toMatchObject({ statusCode: status, code });
    expect(body.message).not.toMatch(/JSON|secret|Cannot/);
  });

  it('gives a generic 400 an empty issue list', () => {
    expect(map(new BadRequestException()).body.details).toEqual([]);
  });

  it('hides a bare ForbiddenException (role/permission guard) as a warned 404 NOT_FOUND', () => {
    const { status, body, log } = map(new ForbiddenException('Insufficient permissions'));
    expect(status).toBe(404);
    expect(body).toMatchObject({ code: 'NOT_FOUND', message: 'Not found', details: null });
    expect(log).toBe('warn');
  });

  it.each([409, 422, 502, 418])(
    'turns a bare HttpException %i (no generic catalogue code) into a warned 500',
    (status) => {
      const mapped = map(new HttpException('Conflict with row 42', status));
      expect(mapped.status).toBe(500);
      expect(mapped.body).toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
      expect(mapped.log).toBe('warn');
    },
  );

  it('maps a Better Auth APIError with a catalogue code to that code', () => {
    const { body } = map(
      new APIError('FORBIDDEN', { code: 'SIGNUP_CLOSED', message: 'Sign-up is closed' }),
    );
    expect(body).toMatchObject({
      statusCode: 403,
      code: 'SIGNUP_CLOSED',
      message: 'Sign-up is closed',
      details: null,
    });
  });

  it('falls back to the code as message for a Better Auth APIError without one', () => {
    expect(map(new APIError('FORBIDDEN', { code: 'SIGNUP_CLOSED' })).body.message).toBe(
      'SIGNUP_CLOSED',
    );
  });

  it('maps a Better Auth APIError with a foreign code by its status', () => {
    expect(
      map(new APIError('UNAUTHORIZED', { code: 'INVALID_TOKEN', message: 'x' })).body.code,
    ).toBe('UNAUTHENTICATED');
    expect(map(new APIError('BAD_REQUEST', { message: 'x' })).body.code).toBe('VALIDATION_ERROR');
    expect(map(new APIError('INTERNAL_SERVER_ERROR')).body.code).toBe('INTERNAL_ERROR');
  });

  it.each([
    ['an Error', new Error('db password=hunter2 at host 10.0.0.5')],
    ['a string', 'boom'],
    ['null', null],
    ['an object with a status-like field', { status: 'nope', code: 'NOT_FOUND' }],
  ])('maps %s to a fixed 500 without leaking it', (_label, err) => {
    const { status, body, log } = map(err);
    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: null,
      requestId: RID,
    });
    expect(log).toBe('error');
  });
});
