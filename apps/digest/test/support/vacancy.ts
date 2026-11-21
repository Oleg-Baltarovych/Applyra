import type { Vacancy } from '../../src/types.ts';

let seq = 0;

/** Test builder: a remote senior Node.js vacancy unless overridden. */
export function vacancy(overrides: Partial<Vacancy> = {}): Vacancy {
  seq += 1;
  return {
    id: `test:${seq}`,
    source: 'test',
    url: `https://jobs.example.com/vacancies/${seq}`,
    title: 'Senior Node.js Developer',
    company: `Company ${seq}`,
    location: { cities: [], remote: 'remote' },
    publishedAt: new Date('2026-11-18T08:00:00Z'),
    description: 'We build APIs with Node.js and TypeScript.',
    ...overrides,
  };
}
