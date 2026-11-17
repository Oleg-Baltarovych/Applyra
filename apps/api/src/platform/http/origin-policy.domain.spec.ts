import { describe, expect, it } from 'vitest';
import { type MutationRequest, checkMutation } from './origin-policy.domain.js';

const WEB = 'https://app.example.com';
const json: MutationRequest = {
  method: 'POST',
  origin: WEB,
  hasBody: true,
  contentType: 'application/json',
  acceptsMultipart: false,
};

describe('checkMutation', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('does not check safe method %s', (method) => {
    expect(
      checkMutation({ ...json, method, origin: undefined, contentType: 'text/plain' }, WEB),
    ).toBe('ok');
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'accepts %s from the web origin with JSON',
    (method) => {
      expect(checkMutation({ ...json, method }, WEB)).toBe('ok');
    },
  );

  it.each([
    ['missing', undefined],
    ['foreign', 'https://evil.example.com'],
    ['a suffix match', 'https://app.example.com.evil.com'],
    ['another scheme', 'http://app.example.com'],
    ['a trailing slash', 'https://app.example.com/'],
    ['different case', 'https://APP.example.com'],
    ['the literal null origin', 'null'],
  ])('rejects a %s Origin with CSRF_ORIGIN', (_label, origin) => {
    expect(checkMutation({ ...json, origin }, WEB)).toBe('CSRF_ORIGIN');
  });

  it('checks the Origin before the content type', () => {
    expect(checkMutation({ ...json, origin: undefined, contentType: 'text/plain' }, WEB)).toBe(
      'CSRF_ORIGIN',
    );
  });

  it('applies to a lowercase method too', () => {
    expect(checkMutation({ ...json, method: 'post', origin: undefined }, WEB)).toBe('CSRF_ORIGIN');
  });

  it.each([
    'application/json; charset=utf-8',
    'Application/JSON',
    'application/json;charset=UTF-8',
  ])('accepts JSON variant %s', (contentType) => {
    expect(checkMutation({ ...json, contentType }, WEB)).toBe('ok');
  });

  it.each([
    ['text/plain', 'text/plain'],
    ['urlencoded', 'application/x-www-form-urlencoded'],
    ['multipart without the decorator', 'multipart/form-data; boundary=x'],
    ['a json lookalike', 'application/json-patch+json'],
    ['missing', undefined],
  ])('rejects a body with %s content type', (_label, contentType) => {
    expect(checkMutation({ ...json, contentType }, WEB)).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('accepts multipart only on @AcceptsMultipart() handlers (Origin still checked)', () => {
    const multipart = {
      ...json,
      contentType: 'multipart/form-data; boundary=x',
      acceptsMultipart: true,
    };
    expect(checkMutation(multipart, WEB)).toBe('ok');
    expect(checkMutation({ ...multipart, origin: undefined }, WEB)).toBe('CSRF_ORIGIN');
    expect(checkMutation({ ...multipart, contentType: 'text/plain' }, WEB)).toBe(
      'UNSUPPORTED_MEDIA_TYPE',
    );
  });

  it('does not require a content type without a body (e.g. DELETE)', () => {
    expect(
      checkMutation({ ...json, method: 'DELETE', hasBody: false, contentType: undefined }, WEB),
    ).toBe('ok');
  });
});
