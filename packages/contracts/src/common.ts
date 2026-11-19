// Shared scalars, field limits and cursor pagination (06-api.md §1, §2, §4, §5).
import { z } from 'zod';

/** Text limits (06 §5; the rest are Applyra defaults for short single-line fields). */
export const FIELD_LIMITS = {
  /** Job title, application companyName / roleTitle, reminder title. */
  title: 300,
  /** `notes`, `descriptionText`, event text. */
  longText: 50_000,
  locationText: 300,
  url: 2048,
  /** `q` search string in list queries. */
  query: 200,
} as const;

/** ISO 8601 UTC with `Z` (06 §1). Wire format of every timestamp. */
export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** ISO 4217 code, upper case (= DB CHECK `*_currency_chk`). */
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 code (e.g. USD)');
export type CurrencyCode = z.infer<typeof CurrencyCode>;

/** ISO 3166-1 alpha-2, upper case (= DB CHECK `job_country_chk`). */
export const CountryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Expected an ISO 3166-1 alpha-2 code (e.g. UA)');
export type CountryCode = z.infer<typeof CountryCode>;

/** Prisma `Int` = PostgreSQL int4. */
const INT32_MAX = 2_147_483_647;

/** Non-negative int4 amount (= DB CHECK `*_salary_nonneg_chk`; larger values would fail in Postgres). */
export const MoneyAmount = z.int().min(0).max(INT32_MAX);

/** Trimmed, non-empty single-line text up to `max`. */
export const requiredText = (max: number) => z.string().trim().min(1).max(max);

/**
 * Optional free text: trimmed, blank → `null` (no empty strings stored). Pair with `.nullish()`/`.optional()`.
 * The transform keeps the input JSON Schema representable (nestjs-zod generates request docs with `io: 'input'`).
 */
export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim() || null);

/** `Idempotency-Key` header value (06 §4; = DB CHECK `idempotency_key_format_chk`). */
export const IdempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, 'Invalid Idempotency-Key');
export type IdempotencyKey = z.infer<typeof IdempotencyKey>;

/** Opaque base64url keyset cursor (06 §2); its content is validated by the API (`400 INVALID_CURSOR`). */
export const Cursor = z
  .string()
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid cursor');

/** Shape of `?limit=&cursor=`; query strings are coerced. Spread into list query schemas. */
export const paginationShape = {
  limit: z.coerce.number<string | number>().int().min(1).max(100).default(25),
  cursor: Cursor.optional(),
};

export const PaginationQuery = z.strictObject(paginationShape);
export type PaginationQuery = z.infer<typeof PaginationQuery>;

/** List envelope `{ items, nextCursor }` (06 §1); `nextCursor = null` on the last page. Responses are non-strict. */
export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: Cursor.nullable() });
