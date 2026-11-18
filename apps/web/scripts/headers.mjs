// @ts-check
// SPA header policy (09 §9.1) in Cloudflare Pages `_headers` syntax: public/_headers is the single source; the Caddy
// `(spa_headers)` snippet must match it (test/security-headers.test.ts). Placeholders use Caddy's env syntax
// `{$NAME}` so the same text works in both. Used by tests, infra/compose/smoke.sh and deploy-prod.yml.

/** @typedef {{ pattern: string, detach: string[], headers: [string, string][] }} HeaderRule */

/**
 * Parses `_headers` text: an unindented URL pattern line, then indented `Name: value` or `! Name` lines.
 * Blank lines and `#` comments are skipped. Throws on anything else (no silent drops).
 * @param {string} text
 * @returns {HeaderRule[]}
 */
export function parseHeadersFile(text) {
  /** @type {HeaderRule[]} */
  const rules = [];
  /** @type {HeaderRule | undefined} */
  let current;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trimEnd();
    const where = `_headers line ${index + 1}`;
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      if (!line.startsWith('/')) throw new Error(`${where}: header lines must be indented`);
      current = { pattern: line, detach: [], headers: [] };
      rules.push(current);
      continue;
    }
    if (!current) throw new Error(`${where}: header before any path`);
    const entry = line.trim();
    const detach = /^!\s*([A-Za-z0-9-]+)$/.exec(entry);
    if (detach?.[1]) {
      current.detach.push(detach[1]);
      continue;
    }
    const header = /^([A-Za-z0-9-]+):\s*(.+)$/.exec(entry);
    if (!header?.[1] || !header[2]) throw new Error(`${where}: expected "Name: value" or "! Name"`);
    const name = header[1];
    if (current.headers.some(([n]) => n.toLowerCase() === name.toLowerCase())) {
      throw new Error(`${where}: duplicate header ${name} in ${current.pattern}`);
    }
    current.headers.push([name, header[2]]);
  }
  return rules;
}

/**
 * Shape checks per placeholder: a value lands inside a header (CSP), so it must not carry `;`, spaces or newlines.
 * @type {Record<string, RegExp>}
 */
const VALUE_RULES = { API_ORIGIN: /^https:\/\/[a-z0-9.-]+(:\d+)?$/ };

/**
 * Replaces `{$NAME}` placeholders with non-empty values; throws if a value is missing or any `{$` is left.
 * @param {string} text
 * @param {Record<string, string | undefined>} values
 * @returns {string}
 */
export function renderHeaders(text, values) {
  const out = text.replace(/\{\$([A-Z0-9_]+)\}/g, (_match, /** @type {string} */ name) => {
    const value = values[name];
    if (!value) throw new Error(`renderHeaders: no value for ${name}`);
    const rule = VALUE_RULES[name];
    if (rule && !rule.test(value))
      throw new Error(`renderHeaders: ${name} must match ${String(rule)}`);
    return value;
  });
  if (out.includes('{$')) throw new Error('renderHeaders: unresolved "{$" placeholder left');
  return out;
}

/**
 * Effective headers (lower-case names) for a URL path under Pages semantics: every matching rule applies in file
 * order; `! Name` removes what earlier rules set; the same header from two rules is joined with ", ".
 * Patterns: literal paths with `*` as a splat.
 * @param {HeaderRule[]} rules
 * @param {string} path
 * @returns {Record<string, string>}
 */
export function headersFor(rules, path) {
  /** @type {Map<string, string>} */
  const result = new Map();
  for (const rule of rules) {
    const regex = new RegExp(
      `^${rule.pattern
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    );
    if (!regex.test(path)) continue;
    for (const name of rule.detach) result.delete(name.toLowerCase());
    for (const [name, value] of rule.headers) {
      const key = name.toLowerCase();
      const previous = result.get(key);
      result.set(key, previous === undefined ? value : `${previous}, ${value}`);
    }
  }
  return Object.fromEntries(result);
}
