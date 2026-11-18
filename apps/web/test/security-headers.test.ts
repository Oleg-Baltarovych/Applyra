// SPA header policy (09 §9.1): public/_headers (Cloudflare Pages) is the source; the Caddy `(spa_headers)` snippet
// (infra/caddy/Caddyfile, local prod stack / fallback) must produce exactly the same headers per path class.
// Runtime check of the served headers: infra/compose/smoke.sh.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { headersFor, parseHeadersFile } from '../scripts/headers.mjs';

const repoRoot = path.join(import.meta.dirname, '../../..');
const headersText = readFileSync(path.join(import.meta.dirname, '../public/_headers'), 'utf8');
const caddyfile = readFileSync(path.join(repoRoot, 'infra/caddy/Caddyfile'), 'utf8');
const rules = parseHeadersFile(headersText);

const PAGE = '/applications';
const ASSET = '/assets/index-abc123.js';

/**
 * Effective headers of the snippet for a page and for a hashed asset. Supported (and required) shape:
 *   (spa_headers) {
 *     @spa_assets path /assets/*        @spa_pages not path /assets/*
 *     header { Name "value" … -Server }  header @spa_pages|@spa_assets Name "value"
 *   }
 * Anything else in the snippet fails the test, so the parser cannot silently skip a directive.
 */
function caddySnippetHeaders(text: string): {
  page: Record<string, string>;
  asset: Record<string, string>;
} {
  const start = text.indexOf('(spa_headers) {');
  if (start === -1) throw new Error('no (spa_headers) snippet');
  const lines = text.slice(start).split(/\r?\n/).slice(1);
  const common: Record<string, string> = {};
  const page: Record<string, string> = {};
  const asset: Record<string, string> = {};
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (!inBlock && line === '}') break;
    if (line === 'header {') {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line === '}') {
        inBlock = false;
        continue;
      }
      if (line === '-Server') continue;
      const m = /^([A-Za-z0-9-]+) "([^"]+)"$/.exec(line);
      if (!m?.[1] || !m[2]) throw new Error(`unexpected header line: ${line}`);
      common[m[1].toLowerCase()] = m[2];
      continue;
    }
    if (line === '@spa_assets path /assets/*' || line === '@spa_pages not path /assets/*') continue;
    const m = /^header @(spa_pages|spa_assets) ([A-Za-z0-9-]+) "([^"]+)"$/.exec(line);
    if (!m?.[1] || !m[2] || !m[3]) throw new Error(`unexpected snippet line: ${line}`);
    (m[1] === 'spa_pages' ? page : asset)[m[2].toLowerCase()] = m[3];
  }
  return { page: { ...common, ...page }, asset: { ...common, ...asset } };
}

describe('SPA security headers', () => {
  it('_headers matches 09 §9.1 (CSP reporting arrives with Sentry web, R1)', () => {
    expect(headersFor(rules, PAGE)).toMatchInlineSnapshot(`
      {
        "cache-control": "no-cache",
        "content-security-policy": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' {$API_ORIGIN} https://*.ingest.de.sentry.io; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
        "cross-origin-opener-policy": "same-origin",
        "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
        "referrer-policy": "strict-origin-when-cross-origin",
        "strict-transport-security": "max-age=63072000; includeSubDomains",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
      }
    `);
    expect(headersFor(rules, ASSET)['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('script-src stays strict (no unsafe-inline / unsafe-eval)', () => {
    const csp = headersFor(rules, PAGE)['content-security-policy'] ?? '';
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toMatch(/unsafe-(inline|eval)/);
  });

  it('the app site imports the snippet and every site drops the Server header', () => {
    const site = (name: string): string => {
      const start = caddyfile.indexOf(`\n{$${name}} {\n`);
      if (start === -1) throw new Error(`no {$${name}} site block`);
      return caddyfile.slice(start, caddyfile.indexOf('\n}\n', start));
    };
    expect(site('APP_DOMAIN')).toMatch(/^\timport spa_headers$/m);
    const snippet = caddyfile.slice(caddyfile.indexOf('(spa_headers) {'));
    expect(snippet.slice(0, snippet.indexOf('\n}\n'))).toMatch(/^\t\t-Server$/m);
    for (const name of ['API_DOMAIN', 'ROOT_DOMAIN']) expect(site(name)).toMatch(/-Server$/m);
  });

  it('Caddy (spa_headers) snippet is identical to _headers for pages and assets', () => {
    const caddy = caddySnippetHeaders(caddyfile);
    expect(caddy.page).toEqual(headersFor(rules, PAGE));
    expect(caddy.asset).toEqual(headersFor(rules, ASSET));
  });
});
