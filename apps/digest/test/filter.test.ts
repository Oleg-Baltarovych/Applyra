import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate, parseProfile, rank, type Match, type Profile } from '../src/filter.ts';
import type { Salary, Vacancy } from '../src/types.ts';
import { vacancy } from './support/vacancy.ts';

const load = (file: string): Profile =>
  parseProfile(JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')));
const profile = load('profile.json');

const kept = (v: Vacancy, p: Profile = profile): Match => {
  const r = evaluate(v, p);
  if (r.kind !== 'match') throw new Error(`expected a match, got reject: ${r.reasons.join(', ')}`);
  return r;
};
const rejected = (v: Vacancy, p: Profile = profile): string => {
  const r = evaluate(v, p);
  if (r.kind !== 'reject') throw new Error(`expected a reject, got match: ${r.reasons.join(', ')}`);
  return r.reasons.join(' ');
};

describe('parseProfile', () => {
  it('accepts the committed profile and the example', () => {
    expect(profile.maxItems).toBe(50);
    expect(profile.salary.minUsdMonth).toBe(2500);
    expect(load('profile.example.json').salary.minUsdMonth).toBeNull();
  });

  it('names the invalid field', () => {
    expect(() => parseProfile({ ...profile, remote: ['moon'] })).toThrow(/remote/);
    expect(() =>
      parseProfile({ ...profile, salary: { ...profile.salary, minUsdMonth: 'a lot' } }),
    ).toThrow(/salary\.minUsdMonth/);
    expect(() => parseProfile({ ...profile, required: [] })).toThrow(/required/);
    expect(() => parseProfile(null)).toThrow(/profile/);
    expect(() => parseProfile({ ...profile, englishLevel: 'B3' })).toThrow(/englishLevel/);
  });

  it('englishLevel is optional (CEFR A1–C2)', () => {
    expect(profile.englishLevel).toBe('B2');
    expect(parseProfile({ ...profile, englishLevel: undefined }).englishLevel).toBeUndefined();
  });
});

describe('stack', () => {
  it('keeps a remote senior Node.js vacancy with reasons', () => {
    const r = kept(vacancy({ title: 'Senior Node.js / NestJS Developer' }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons).toEqual(expect.arrayContaining(['node.js', 'nestjs', 'remote']));
  });

  it('requires Node.js or TypeScript somewhere', () => {
    expect(
      rejected(vacancy({ title: 'Backend Developer', description: 'Elixir and Erlang only.' })),
    ).toMatch(/node\.js|typescript/);
  });

  it('matches "ts" only as a standalone word', () => {
    rejected(
      vacancy({ title: 'Backend Developer', description: 'Great benefits, tests, sports.' }),
    );
    kept(vacancy({ title: 'Backend Developer', description: 'Stack: TS, Postgres.' }));
  });

  it('keeps a full-stack Node.js + Go post, noting the other stack without a penalty', () => {
    const both = kept(vacancy({ title: 'Full-stack Engineer (Node.js + Go)' }));
    const plain = kept(vacancy({ title: 'Full-stack Engineer (Node.js)' }));
    expect(both.caveats).toContain('+ golang');
    expect(both.score).toBe(plain.score);
  });

  it('keeps another-stack title when Node.js/TS is in the description: caveat and a lower rank', () => {
    const description = 'React, TypeScript, Python, PostgreSQL.';
    const python = kept(vacancy({ title: 'Full Stack Developer (React + Python)', description }));
    const own = kept(vacancy({ title: 'Full Stack Developer (React)', description }));
    expect(python.caveats).toContain('+ python');
    expect(python.score).toBeLessThan(own.score);
    kept(vacancy({ title: 'Senior Java Developer', description: 'Some Node.js tooling.' }));
  });

  it('rejects another-stack title when Node.js/TS appears nowhere', () => {
    expect(
      rejected(vacancy({ title: 'Senior Java Developer', description: 'Spring Boot, Kafka.' })),
    ).toBe('stack: java');
  });

  it('does not confuse JavaScript with Java', () => {
    kept(vacancy({ title: 'Senior JavaScript / Node.js Engineer' }));
  });

  it('excludes other roles (QA/DevOps) unless the title itself names Node.js/TS', () => {
    expect(
      rejected(vacancy({ title: 'Senior AQA Engineer', description: 'Selenium, TypeScript.' })),
    ).toBe('role: qa');
    rejected(vacancy({ title: 'DevOps Engineer', description: 'Terraform, some Node.js.' }));
    kept(vacancy({ title: 'Node.js Developer (DevOps culture)' }));
  });

  it('does not exclude gambling, betting or crypto domains; crypto is a bonus', () => {
    kept(vacancy({ description: 'Node.js for a betting and gambling platform.' }));
    const crypto = kept(vacancy({ description: 'Node.js, TypeScript, DeFi protocols.' }));
    expect(crypto.reasons).toContain('crypto');
  });
});

describe('work mode', () => {
  it('excludes office and hybrid vacancies, even in a listed city', () => {
    rejected(vacancy({ location: { cities: ['Lviv'], remote: 'office' } }));
    rejected(vacancy({ location: { cities: ['Lviv'], remote: 'hybrid' } }));
  });

  it('keeps remote-unclear vacancies with a lower score and a caveat', () => {
    const remote = kept(vacancy());
    const unclear = kept(vacancy({ location: { cities: [], remote: 'unknown' } }));
    expect(unclear.score).toBeLessThan(remote.score);
    expect(unclear.caveats).toContain('remote unclear');
  });

  it('drops remote-unclear vacancies when the profile says so', () => {
    rejected(vacancy({ location: { cities: [], remote: 'unknown' } }), {
      ...profile,
      remoteUnknown: 'drop',
    });
  });
});

describe('level', () => {
  it('excludes junior, trainee and intern titles', () => {
    rejected(vacancy({ title: 'Junior Node.js Developer' }));
    rejected(vacancy({ title: 'Node.js Trainee' }));
    rejected(vacancy({ title: 'Стажер Node.js' }));
  });

  it('keeps a title that also names an allowed level', () => {
    kept(vacancy({ title: 'Junior/Middle Node.js Developer' }));
  });

  it('infers the level from the description when the title has none', () => {
    const levelled = kept(
      vacancy({ title: 'Node.js Developer', description: 'Node.js, 3+ years.' }),
    );
    expect(levelled.caveats).toEqual([]);
    kept(vacancy({ title: 'Node.js Developer', description: 'Node.js, від 2 років досвіду.' }));
    kept(vacancy({ title: 'Node.js Developer', description: 'We want a senior Node.js dev.' }));
  });

  it('keeps 1+ year and level-unclear posts with a lower score', () => {
    const clear = kept(vacancy({ title: 'Node.js Developer', description: 'Node.js, 3+ years.' }));
    const oneYear = kept(vacancy({ title: 'Node.js Developer', description: 'Node.js, 1+ year.' }));
    const unclear = kept(vacancy({ title: 'Node.js Developer', description: 'Node.js APIs.' }));
    expect(oneYear.score).toBeLessThan(clear.score);
    expect(unclear.score).toBeLessThan(clear.score);
    expect(unclear.caveats).toContain('level unclear');
  });

  it('uses the source experience field', () => {
    const r = kept(
      vacancy({ title: 'Node.js Developer', description: 'Node.js.', experienceYears: 3 }),
    );
    expect(r.caveats).toEqual([]);
  });

  it('excludes management titles but keeps a tech lead', () => {
    rejected(vacancy({ title: 'Head of Engineering (Node.js)' }));
    rejected(vacancy({ title: 'Node.js Team Lead' }));
    kept(vacancy({ title: 'Senior Node.js Tech Lead' }));
  });
});

describe('language', () => {
  it('rejects text in a language outside the profile', () => {
    rejected(
      vacancy({ title: 'Node.js разработчик', description: 'Мы ищем разработчика в команду.' }),
    );
    kept(vacancy({ title: 'Senior Node.js розробник', description: 'Шукаємо розробника.' }));
  });
});

describe('salary (min $2500/month, no upper cap)', () => {
  const paid = (salary: Salary) => vacancy({ salary });

  it('excludes when the known upper bound is below the minimum ("до $2000")', () => {
    rejected(paid({ max: 2000, currency: 'USD' }));
  });

  it('keeps a range that reaches the minimum ("$2000–3000") with a bonus reason', () => {
    const r = kept(paid({ min: 2000, max: 3000, currency: 'USD' }));
    expect(r.reasons).toContain('$2000–3000');
  });

  it('keeps a lower bound below the minimum ("від $1500") without a bonus', () => {
    const r = kept(paid({ min: 1500, currency: 'USD' }));
    expect(r.score).toBe(kept(vacancy()).score);
  });

  it('converts UAH with the profile rate and a 10% tolerance', () => {
    // 90 000 / 41 ≈ $2195 < 2500 × 0.9 = $2250 → excluded.
    rejected(paid({ max: 90_000, currency: 'UAH' }));
    // 95 000 / 41 ≈ $2317 ≥ $2250 → kept (within tolerance, below the bonus line).
    kept(paid({ max: 95_000, currency: 'UAH' }));
  });

  it('never excludes or penalises a missing salary', () => {
    const r = kept(vacancy());
    expect(r.score).toBe(kept(vacancy({ salary: { min: 1000, currency: 'USD' } })).score);
  });

  it('never excludes a high salary and ranks higher pay first among equal posts', () => {
    const low = paid({ min: 3000, currency: 'USD' });
    const high = paid({ min: 5000, currency: 'USD' });
    const huge = paid({ min: 50_000, currency: 'USD' });
    const ranked = rank([low, high], profile).map((r) => r.vacancy);
    expect(ranked).toEqual([high, low]);
    kept(huge);
  });

  it('caps the salary bonus below a stack match', () => {
    const rich = kept(
      vacancy({
        title: 'Senior Developer',
        description: 'TypeScript.',
        salary: { min: 50_000, currency: 'USD' },
      }),
    );
    const stack = kept(vacancy({ title: 'Senior Node.js / TypeScript / NestJS Developer' }));
    expect(stack.score).toBeGreaterThan(rich.score);
  });

  it('ignores salary when no minimum is set', () => {
    kept(paid({ max: 500, currency: 'USD' }), {
      ...profile,
      salary: { ...profile.salary, minUsdMonth: null },
    });
  });
});

describe('rank', () => {
  it('returns matches only, best score first, capped at maxItems', () => {
    const items = [
      vacancy({ title: 'Senior Node.js Developer', description: 'Node.js.' }),
      vacancy({ title: 'Senior Java Developer' }),
      vacancy({
        title: 'Senior Full-stack TypeScript / Node.js Engineer',
        description: 'NestJS, React, PostgreSQL, Redis, Docker.',
      }),
    ];
    const ranked = rank(items, { ...profile, maxItems: 1 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.vacancy).toBe(items[2]);
  });

  it('puts clean matches before those with caveats, even when the caveated one scores higher', () => {
    const caveated = vacancy({
      title: 'Senior Full-stack Node.js / TypeScript / NestJS Engineer (+ Go)',
      description: 'NestJS, React, PostgreSQL, Redis, Docker, Kubernetes.',
    });
    const clean = vacancy({ title: 'Senior Node.js Developer', description: 'Node.js.' });
    expect(kept(caveated).score).toBeGreaterThan(kept(clean).score);
    expect(rank([caveated, clean], profile).map((r) => r.vacancy)).toEqual([clean, caveated]);
  });
});
