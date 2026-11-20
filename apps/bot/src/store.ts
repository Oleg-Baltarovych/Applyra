import type { StatusCode } from '@applyra/digest/status';

export interface StatusRecord {
  vacancyId: string;
  status: StatusCode;
  title: string;
  /** Second line of the vacancy message (company · salary · where). */
  meta: string;
  url: string;
  updatedAt: Date;
}

export interface StatusStore {
  get(vacancyId: string): Promise<StatusRecord | undefined>;
  put(record: StatusRecord): Promise<void>;
  remove(vacancyId: string): Promise<void>;
  /** Newest first. */
  list(): Promise<StatusRecord[]>;
}

/** The slice of Cloudflare D1 used here (keeps @cloudflare/workers-types out of the deps). */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
  };
}

interface Row {
  vacancy_id: string;
  status: string;
  title: string;
  meta: string;
  url: string;
  updated_at: string;
}

const CODES: readonly string[] = ['a', 'p', 'r', 'x'];
const isCode = (s: string): s is StatusCode => CODES.includes(s);

const toRecord = (r: Row): StatusRecord | undefined =>
  isCode(r.status)
    ? {
        vacancyId: r.vacancy_id,
        status: r.status,
        title: r.title,
        meta: r.meta,
        url: r.url,
        updatedAt: new Date(r.updated_at),
      }
    : undefined;

const LIST_LIMIT = 500;

export function d1Store(db: D1Like): StatusStore {
  return {
    async get(id) {
      const row = await db
        .prepare('SELECT * FROM statuses WHERE vacancy_id = ?')
        .bind(id)
        .first<Row>();
      return row ? toRecord(row) : undefined;
    },
    async put(r) {
      await db
        .prepare(
          `INSERT INTO statuses (vacancy_id, status, title, meta, url, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (vacancy_id) DO UPDATE SET status = excluded.status, title = excluded.title,
             meta = excluded.meta, url = excluded.url, updated_at = excluded.updated_at`,
        )
        .bind(r.vacancyId, r.status, r.title, r.meta, r.url, r.updatedAt.toISOString())
        .run();
    },
    async remove(id) {
      await db.prepare('DELETE FROM statuses WHERE vacancy_id = ?').bind(id).run();
    },
    async list() {
      const { results } = await db
        .prepare('SELECT * FROM statuses ORDER BY updated_at DESC LIMIT ?')
        .bind(LIST_LIMIT)
        .all<Row>();
      return results.map(toRecord).filter((r): r is StatusRecord => r !== undefined);
    },
  };
}
