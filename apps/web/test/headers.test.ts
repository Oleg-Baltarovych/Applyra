// Cloudflare Pages `_headers` parsing/rendering (scripts/headers.mjs): the single source of the SPA header policy
// (09 §9.1), used by security-headers.test.ts, infra/compose/smoke.sh and deploy-prod.yml.
import { describe, expect, it } from 'vitest';
import { headersFor, parseHeadersFile, renderHeaders } from '../scripts/headers.mjs';

const FILE = [
  '# comment',
  '/*',
  '  X-Frame-Options: DENY',
  '  Content-Security-Policy: default-src {$API_ORIGIN}',
  '  Cache-Control: no-cache',
  '',
  '/assets/*',
  '  ! Cache-Control',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
].join('\n');

describe('parseHeadersFile', () => {
  it('parses rules in order with set headers and detaches', () => {
    expect(parseHeadersFile(FILE)).toEqual([
      {
        pattern: '/*',
        detach: [],
        headers: [
          ['X-Frame-Options', 'DENY'],
          ['Content-Security-Policy', 'default-src {$API_ORIGIN}'],
          ['Cache-Control', 'no-cache'],
        ],
      },
      {
        pattern: '/assets/*',
        detach: ['Cache-Control'],
        headers: [['Cache-Control', 'public, max-age=31536000, immutable']],
      },
    ]);
  });

  it.each([
    ['  X-A: 1', 'before any path'],
    ['/*\nX-A: 1', 'must be indented'],
    ['/*\n  not-a-header', 'Name: value'],
    ['/*\n  X-A: 1\n  x-a: 2', 'duplicate'],
  ])('rejects %j (%s)', (text, problem) => {
    expect(() => parseHeadersFile(text)).toThrow(problem);
  });
});

describe('renderHeaders', () => {
  it('substitutes every placeholder', () => {
    const out = renderHeaders(FILE, { API_ORIGIN: 'https://api.example.com' });
    expect(out).toContain('default-src https://api.example.com');
    expect(out).not.toContain('{$');
  });

  it('throws on a placeholder without a value', () => {
    expect(() => renderHeaders(FILE, {})).toThrow('API_ORIGIN');
    expect(() => renderHeaders(FILE, { API_ORIGIN: '' })).toThrow('API_ORIGIN');
  });

  it.each([
    'http://api.example.com',
    'https://api.example.com/api/v1',
    "https://api.example.com; script-src 'unsafe-inline'",
    'https://api.example.com\n  X-Injected: 1',
  ])('rejects API_ORIGIN %j (https origin only)', (origin) => {
    expect(() => renderHeaders(FILE, { API_ORIGIN: origin })).toThrow('API_ORIGIN');
  });

  it('throws on a leftover placeholder of unexpected syntax', () => {
    expect(() => renderHeaders('/*\n  X-A: {$API-ORIGIN}', { API_ORIGIN: 'x' })).toThrow('{$');
  });
});

describe('headersFor', () => {
  const rules = parseHeadersFile(renderHeaders(FILE, { API_ORIGIN: 'https://api.example.com' }));

  it('applies every matching rule; detach removes an earlier value (Pages would join duplicates)', () => {
    expect(headersFor(rules, '/assets/index-abc.js')).toEqual({
      'x-frame-options': 'DENY',
      'content-security-policy': 'default-src https://api.example.com',
      'cache-control': 'public, max-age=31536000, immutable',
    });
  });

  it('non-asset paths get only the /* rule', () => {
    expect(headersFor(rules, '/applications')).toMatchObject({ 'cache-control': 'no-cache' });
  });

  it('joins a header set by two matching rules without a detach', () => {
    const joined = parseHeadersFile('/*\n  X-A: 1\n/a/*\n  X-A: 2');
    expect(headersFor(joined, '/a/b')).toEqual({ 'x-a': '1, 2' });
  });
});
