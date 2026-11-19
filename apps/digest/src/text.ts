/**
 * A keyword spec is `label|alt|alt` ("node.js|nodejs|node"): any alternative matches, the label is
 * what reasons show. Matching is case-insensitive and word-boundary aware for any alphabet
 * ("ts" does not match "tests"; "java" does not match "javascript"; ".net" and "c#" work).
 */
export interface Keyword {
  label: string;
  test(text: string): boolean;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function keyword(spec: string): Keyword {
  const alternatives = spec
    .split('|')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const label = alternatives[0] ?? spec;
  const body = alternatives.map((a) => escapeRegExp(a).replace(/ /g, '[\\s-]+')).join('|');
  // Lookarounds instead of \b: \b is ASCII-only and breaks on "c#", ".net" and Cyrillic.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'iu');
  return { label, test: (text) => re.test(text) };
}

export const keywords = (specs: string[]): Keyword[] => specs.map(keyword);

export type Language = 'uk' | 'ru' | 'en';

/**
 * Cheap language guess: mostly Latin → en; Cyrillic with і/ї/є/ґ → uk, with ы/э/ъ/ё → ru.
 * Returns undefined when it cannot tell (short or mixed Cyrillic) — callers keep such posts.
 */
export function detectLanguage(text: string): Language | undefined {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return undefined;
  const cyrillic = letters.filter((c) => /\p{Script=Cyrillic}/u.test(c)).length;
  if (cyrillic / letters.length < 0.3) return 'en';
  const uk = /[іїєґ]/iu.test(text);
  const ru = /[ыэъё]/iu.test(text);
  if (uk && !ru) return 'uk';
  if (ru && !uk) return 'ru';
  return undefined;
}

const YEARS =
  /(?:від|от|from|at least|min(?:imum)?\.?)?\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?|рок(?:и|ів|у)|рік|лет|года?)(?![\p{L}])/giu;

/** Largest "N+ years" / "від N років" requirement in the text, if any. */
export function experienceYears(text: string): number | undefined {
  let best: number | undefined;
  for (const m of text.matchAll(YEARS)) {
    const n = Number(m[1]);
    if (best === undefined || n > best) best = n;
  }
  return best;
}
