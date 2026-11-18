import { describe, expect, it } from 'vitest';
import { parseWebEnv } from './env';

describe('parseWebEnv', () => {
  it('parses the API URL and defaults the Google flag to false', () => {
    expect(parseWebEnv({ VITE_API_URL: 'http://localhost:3000/api/v1' })).toEqual({
      apiUrl: 'http://localhost:3000/api/v1',
      authGoogleEnabled: false,
    });
  });

  it('accepts the flag only as the strings true/false', () => {
    const base = { VITE_API_URL: 'https://api.example.com/api/v1' };
    expect(parseWebEnv({ ...base, VITE_AUTH_GOOGLE_ENABLED: 'true' }).authGoogleEnabled).toBe(true);
    expect(parseWebEnv({ ...base, VITE_AUTH_GOOGLE_ENABLED: 'false' }).authGoogleEnabled).toBe(
      false,
    );
    expect(parseWebEnv({ ...base, VITE_AUTH_GOOGLE_ENABLED: '' }).authGoogleEnabled).toBe(false);
    expect(() => parseWebEnv({ ...base, VITE_AUTH_GOOGLE_ENABLED: 'yes' })).toThrow(
      /VITE_AUTH_GOOGLE_ENABLED/,
    );
  });

  it.each([
    {},
    { VITE_API_URL: '' },
    { VITE_API_URL: 'not a url' },
    { VITE_API_URL: 'ftp://x/api' },
  ])('rejects a missing or invalid VITE_API_URL (%o) naming the key', (raw) => {
    expect(() => parseWebEnv(raw)).toThrow(/VITE_API_URL/);
  });

  it('strips a trailing slash from the API URL', () => {
    expect(parseWebEnv({ VITE_API_URL: 'http://localhost:3000/api/v1/' }).apiUrl).toBe(
      'http://localhost:3000/api/v1',
    );
  });
});

describe('parseWebEnv in a production build (PROD)', () => {
  it('rejects a plain-http API URL on a real host', () => {
    expect(() =>
      parseWebEnv({ PROD: true, VITE_API_URL: 'http://api.example.com/api/v1' }),
    ).toThrow(/VITE_API_URL: must be https in production/);
  });

  it.each(['https://api.example.com/api/v1', 'http://localhost:3000/api/v1'])(
    'accepts %s',
    (url) => {
      expect(parseWebEnv({ PROD: true, VITE_API_URL: url }).apiUrl).toBe(url);
    },
  );

  it('allows http on any host outside production builds', () => {
    expect(parseWebEnv({ PROD: false, VITE_API_URL: 'http://api.example.com/api/v1' }).apiUrl).toBe(
      'http://api.example.com/api/v1',
    );
  });
});
