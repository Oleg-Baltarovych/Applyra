import { detectLanguage, experienceYears, keywords, type Keyword, type Language } from './text.ts';
import type { RemoteMode, Salary, Vacancy } from './types.ts';

type WorkMode = Exclude<RemoteMode, 'unknown'>;

/** The owner's preferences (apps/digest/profile.json). Keyword lists use `label|alt|alt` specs (text.ts). */
export interface Profile {
  /** Role/stack words that make a title relevant. */
  titleKeywords: string[];
  /** At least one must appear in the title or description. */
  required: string[];
  /** Extra score + reason when present anywhere. */
  bonus: string[];
  /**
   * Other languages/frameworks. A title naming one is excluded only when no `required` keyword appears
   * anywhere; otherwise kept with a "+ <stack>" caveat (and ranked lower when the title has no `required`).
   */
  excludeStacks: string[];
  /** Other roles (QA, DevOps, data…): excluded when the title names one and no `required` keyword. */
  excludeRoles: string[];
  /** Management titles, always excluded. */
  excludeTitles: string[];
  level: { exclude: string[]; allow: string[]; minExperienceYears: number };
  remote: WorkMode[];
  remoteUnknown: 'keep' | 'drop';
  languages: Language[];
  /** Monthly floor in USD (null = no salary rule); UAH converted with `uahPerUsd`, minus `uahTolerance`. */
  salary: { minUsdMonth: number | null; uahPerUsd: number; uahTolerance: number };
  maxItems: number;
}

export interface Match {
  kind: 'match';
  score: number;
  /** Why it matched, strongest first. */
  reasons: string[];
  /** Doubts that lowered the score ("remote unclear", "level unclear"). */
  caveats: string[];
}
export interface Reject {
  kind: 'reject';
  reasons: string[];
}
export type Evaluation = Match | Reject;
export type Ranked = Omit<Match, 'kind'> & { vacancy: Vacancy };

// ── profile validation (boundary: profile.json is external input) ────────────────────────────────

const fail = (path: string, expected: string): never => {
  throw new Error(`Invalid profile: ${path} must be ${expected}`);
};
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string) => (isObject(v) ? v : fail(path, 'an object'));
const strings = (v: unknown, path: string, nonEmpty = false): string[] => {
  if (!Array.isArray(v) || !v.every((s) => typeof s === 'string' && s.trim() !== ''))
    return fail(path, 'an array of non-empty strings');
  if (nonEmpty && v.length === 0) return fail(path, 'a non-empty array');
  return v;
};
const num = (v: unknown, path: string, min = 0): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fail(path, `a number ≥ ${min}`);
const oneOf = <T extends string>(v: unknown, path: string, allowed: readonly T[]): T =>
  allowed.find((a) => a === v) ?? fail(path, `one of ${allowed.join(', ')}`);
const list = <T extends string>(v: unknown, path: string, allowed: readonly T[]): T[] =>
  strings(v, path, true).map((s, i) => oneOf(s, `${path}[${i}]`, allowed));

export function parseProfile(input: unknown): Profile {
  const p = obj(input, 'profile');
  const level = obj(p.level, 'level');
  const salary = obj(p.salary, 'salary');
  return {
    titleKeywords: strings(p.titleKeywords, 'titleKeywords'),
    required: strings(p.required, 'required', true),
    bonus: strings(p.bonus, 'bonus'),
    excludeStacks: strings(p.excludeStacks, 'excludeStacks'),
    excludeRoles: strings(p.excludeRoles, 'excludeRoles'),
    excludeTitles: strings(p.excludeTitles, 'excludeTitles'),
    level: {
      exclude: strings(level.exclude, 'level.exclude'),
      allow: strings(level.allow, 'level.allow'),
      minExperienceYears: num(level.minExperienceYears, 'level.minExperienceYears'),
    },
    remote: list(p.remote, 'remote', ['remote', 'hybrid', 'office'] as const),
    remoteUnknown: oneOf(p.remoteUnknown, 'remoteUnknown', ['keep', 'drop'] as const),
    languages: list(p.languages, 'languages', ['uk', 'en', 'ru'] as const),
    salary: {
      minUsdMonth:
        salary.minUsdMonth === null ? null : num(salary.minUsdMonth, 'salary.minUsdMonth', 1),
      uahPerUsd: num(salary.uahPerUsd, 'salary.uahPerUsd', 1),
      uahTolerance: num(salary.uahTolerance, 'salary.uahTolerance'),
    },
    maxItems: num(p.maxItems, 'maxItems', 1),
  };
}

// ── evaluation ───────────────────────────────────────────────────────────────────────────────────

/** Score weights. A stack match must always outweigh the salary bonus (capped at SALARY_MAX). */
const W = {
  title: 3,
  requiredTitle: 2,
  requiredText: 1,
  bonus: 1,
  remote: 2,
  level: 2,
  otherStack: -3,
};
const SALARY_BASE = 1;
const SALARY_MAX = 4;
const SALARY_STEP_USD = 1000;

interface Compiled {
  titleKeywords: Keyword[];
  required: Keyword[];
  bonus: Keyword[];
  excludeStacks: Keyword[];
  excludeRoles: Keyword[];
  excludeTitles: Keyword[];
  levelExclude: Keyword[];
  levelAllow: Keyword[];
}
const cache = new WeakMap<Profile, Compiled>();
const compile = (p: Profile): Compiled => {
  let c = cache.get(p);
  if (!c) {
    c = {
      titleKeywords: keywords(p.titleKeywords),
      required: keywords(p.required),
      bonus: keywords(p.bonus),
      excludeStacks: keywords(p.excludeStacks),
      excludeRoles: keywords(p.excludeRoles),
      excludeTitles: keywords(p.excludeTitles),
      levelExclude: keywords(p.level.exclude),
      levelAllow: keywords(p.level.allow),
    };
    cache.set(p, c);
  }
  return c;
};

const usd = (amount: number, s: Salary, p: Profile): number | undefined =>
  s.currency === 'USD' ? amount : s.currency === 'UAH' ? amount / p.salary.uahPerUsd : undefined; // no EUR rate yet

const formatUsd = (min: number | undefined, max: number | undefined): string => {
  const r = (n: number) => Math.round(n);
  if (min !== undefined && max !== undefined)
    return min === max ? `$${r(min)}` : `$${r(min)}–${r(max)}`;
  return min !== undefined ? `$${r(min)}+` : `up to $${r(max ?? 0)}`;
};

export function evaluate(v: Vacancy, profile: Profile): Evaluation {
  const k = compile(profile);
  const title = v.title;
  const text = `${v.title}\n${v.description ?? ''}`;
  const reject = (reason: string): Reject => ({ kind: 'reject', reasons: [reason] });

  // Roles: another role in the title only counts when the title has no Node/TS keyword.
  // Stacks: another language/framework in the title is fine while Node/TS appears anywhere
  // ("Full Stack (React + Python)" with TypeScript in the text stays, ranked lower).
  const requiredInTitle = k.required.filter((kw) => kw.test(title));
  const requiredInText = k.required.filter((kw) => kw.test(text));
  const otherRole = k.excludeRoles.find((kw) => kw.test(title));
  if (otherRole && requiredInTitle.length === 0) return reject(`role: ${otherRole.label}`);
  const otherStack = k.excludeStacks.find((kw) => kw.test(title));
  if (otherStack && requiredInText.length === 0) return reject(`stack: ${otherStack.label}`);
  if (requiredInText.length === 0)
    return reject(`needs ${k.required.map((kw) => kw.label).join(' or ')}`);
  const management = k.excludeTitles.find((kw) => kw.test(title));
  if (management) return reject(`title: ${management.label}`);

  const weights = new Map<string, number>();
  const add = (label: string, w: number) =>
    weights.set(label, Math.max(weights.get(label) ?? 0, w));
  const caveats: string[] = [];
  let penalty = 0;
  if (otherStack) {
    caveats.push(`+ ${otherStack.label}`);
    if (requiredInTitle.length === 0) penalty = W.otherStack;
  }

  for (const kw of k.titleKeywords) if (kw.test(title)) add(kw.label, W.title);
  for (const kw of requiredInText)
    add(kw.label, requiredInTitle.includes(kw) ? W.requiredTitle : W.requiredText);
  for (const kw of k.bonus) if (kw.test(text)) add(kw.label, W.bonus);

  // Level: the title decides when it names a level; "Junior/Middle" is kept.
  const allowInTitle = k.levelAllow.find((kw) => kw.test(title));
  const excludeInTitle = k.levelExclude.find((kw) => kw.test(title));
  if (excludeInTitle && !allowInTitle) return reject(`level: ${excludeInTitle.label}`);
  const allowInText = allowInTitle ?? k.levelAllow.find((kw) => kw.test(text));
  if (allowInText) add(allowInText.label, W.level);
  else {
    const found = [v.experienceYears, experienceYears(v.description ?? '')].filter(
      (n): n is number => n !== undefined,
    );
    const years = found.length ? Math.max(...found) : undefined;
    if (years !== undefined && years >= profile.level.minExperienceYears)
      add(`${years}+ years`, W.level);
    else caveats.push(years !== undefined ? `${years}+ year exp` : 'level unclear');
  }

  const mode = v.location.remote;
  if (mode === 'unknown') {
    if (profile.remoteUnknown === 'drop') return reject('remote unclear');
    caveats.push('remote unclear');
  } else if (!profile.remote.includes(mode)) return reject(`work mode: ${mode}`);
  else add(mode, W.remote);

  const language = detectLanguage(text);
  if (language && !profile.languages.includes(language)) return reject(`language: ${language}`);

  const floor = profile.salary.minUsdMonth;
  if (floor !== null && v.salary) {
    const s = v.salary;
    const min = s.min === undefined ? undefined : usd(s.min, s, profile);
    const max = s.max === undefined ? undefined : usd(s.max, s, profile);
    const tolerance = s.currency === 'UAH' ? profile.salary.uahTolerance : 0;
    // Only a known upper bound can exclude; "від $X" is a lower bound and never does.
    if (max !== undefined && max < floor * (1 - tolerance))
      return reject(`salary ${formatUsd(min, max)}`);
    const best = max ?? min;
    if (best !== undefined && best >= floor) {
      const bonus = Math.min(SALARY_MAX, SALARY_BASE + (best - floor) / SALARY_STEP_USD);
      add(formatUsd(min, max), bonus);
    }
  }

  const sorted = [...weights].sort((a, b) => b[1] - a[1]);
  return {
    kind: 'match',
    score: sorted.reduce((sum, [, w]) => sum + w, penalty),
    reasons: sorted.map(([label]) => label),
    caveats,
  };
}

/**
 * Matches only: clean ones (no caveats) first, then those with caveats; within each, best score first
 * (newer first on ties). At most `profile.maxItems`.
 */
export function rank(vacancies: Vacancy[], profile: Profile): Ranked[] {
  const ranked: Ranked[] = [];
  for (const vacancy of vacancies) {
    const r = evaluate(vacancy, profile);
    if (r.kind === 'match')
      ranked.push({ vacancy, score: r.score, reasons: r.reasons, caveats: r.caveats });
  }
  return ranked
    .sort(
      (a, b) =>
        Number(a.caveats.length > 0) - Number(b.caveats.length > 0) ||
        b.score - a.score ||
        b.vacancy.publishedAt.getTime() - a.vacancy.publishedAt.getTime(),
    )
    .slice(0, profile.maxItems);
}
