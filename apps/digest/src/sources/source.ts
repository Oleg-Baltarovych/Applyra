import type { RawItem } from '../types.ts';

/**
 * A vacancy source (public RSS/API only — never bypass ToS, auth or CAPTCHA).
 * `fetch()` errors are logged: throw `new Error('<source>: HTTP <status>')`-style messages (name + status),
 * never response bodies, headers or full urls. main.ts redacts urls anyway as a second guard.
 */
export interface Source {
  name: string;
  fetch(): Promise<RawItem[]>;
}

/** In-memory source for tests and `--dry-run --source=fake`. Never used for a real send. */
export class FakeSource implements Source {
  readonly name: string;
  readonly #items: RawItem[];

  constructor(items: RawItem[], name = 'fake') {
    this.name = name;
    this.#items = items;
  }

  async fetch(): Promise<RawItem[]> {
    return this.#items;
  }
}

/** Synthetic sample for `--dry-run --source=fake` (no real companies or people). */
export const SAMPLE_ITEMS: RawItem[] = [
  {
    source: 'fake',
    url: 'https://jobs.example.com/vacancies/1001/?utm_source=rss',
    title: 'Senior Node.js / NestJS Engineer',
    company: 'Example Labs',
    salary: '$4000–5500',
    location: 'віддалено',
    description: 'TypeScript, NestJS, PostgreSQL, Redis, RabbitMQ, Docker. 4+ years.',
    publishedAt: '2026-11-18T09:00:00Z',
  },
  {
    source: 'fake',
    url: 'https://jobs.example.com/vacancies/1002/',
    title: 'Full-stack Developer (Node.js + React)',
    company: 'Sample Fintech',
    location: 'Remote',
    description: 'Node.js, React, PostgreSQL. 3+ years of commercial experience.',
    publishedAt: '2026-11-18T10:00:00Z',
  },
  {
    source: 'fake',
    url: 'https://jobs.example.com/vacancies/1003/',
    title: 'Senior Java Developer',
    company: 'Example Bank',
    location: 'Київ, офіс',
    description: 'Java, Spring.',
    publishedAt: '2026-11-18T11:00:00Z',
  },
  {
    source: 'fake',
    url: 'https://jobs.example.com/vacancies/1004/',
    title: 'Junior Node.js Developer',
    company: 'Example Studio',
    location: 'remote',
    description: 'Node.js basics.',
    publishedAt: '2026-11-18T12:00:00Z',
  },
  {
    source: 'fake',
    url: 'https://jobs.example.com/vacancies/1001/',
    title: 'Senior Node.js / NestJS Engineer',
    company: 'Example Labs',
    description: 'Duplicate of 1001 via another feed.',
    publishedAt: '2026-11-18T09:05:00Z',
  },
];
