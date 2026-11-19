import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CreateJob, DuplicateJobDetails, FIELD_LIMITS, Job, UpdateJob } from '../src/index.js';

const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const minimal = { title: 'Senior TypeScript Engineer', companyName: 'Acme' };
const salary = { min: 4000, max: 6000, currency: 'USD', period: 'MONTH' };

function issuePaths(result: { error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return result.error?.issues.map((i) => i.path.join('.')) ?? [];
}

describe('CreateJob (FR-JOB-01/02, M1-04)', () => {
  it('accepts the minimal form and a full one', () => {
    expect(CreateJob.parse(minimal)).toEqual(minimal);
    const full = {
      ...minimal,
      salary: { ...salary, isGross: true },
      descriptionText: 'Pasted <b>text</b>',
      locationText: 'Kyiv',
      countryCode: 'UA',
      workMode: 'REMOTE',
      employmentType: 'FULL_TIME',
      seniority: 'SENIOR',
      englishLevel: 'B2',
      originalUrl: 'https://jobs.example.com/1?utm_source=x',
    };
    expect(CreateJob.parse(full)).toEqual(full);
  });

  it('trims and requires title and companyName', () => {
    expect(CreateJob.parse({ title: '  Dev ', companyName: ' Acme ' })).toEqual({
      title: 'Dev',
      companyName: 'Acme',
    });
    expect(CreateJob.safeParse({ ...minimal, title: '   ' }).success).toBe(false);
    expect(CreateJob.safeParse({ title: 'Dev' }).success).toBe(false);
  });

  it('is strict: rejects unknown keys and server-owned fields', () => {
    for (const key of [
      'userId',
      'ownerId',
      'role',
      'visibility',
      'canonicalUrl',
      'extractionMethod',
      'foo',
    ]) {
      expect(CreateJob.safeParse({ ...minimal, [key]: 'x' }).success, key).toBe(false);
    }
  });

  it('enforces title ≤ 300 and descriptionText ≤ 50 000 at the boundary', () => {
    expect(FIELD_LIMITS.title).toBe(300);
    expect(FIELD_LIMITS.longText).toBe(50_000);
    expect(CreateJob.safeParse({ ...minimal, title: 'a'.repeat(300) }).success).toBe(true);
    expect(CreateJob.safeParse({ ...minimal, title: 'a'.repeat(301) }).success).toBe(false);
    expect(CreateJob.safeParse({ ...minimal, descriptionText: 'a'.repeat(50_000) }).success).toBe(
      true,
    );
    expect(CreateJob.safeParse({ ...minimal, descriptionText: 'a'.repeat(50_001) }).success).toBe(
      false,
    );
  });

  it('accepts only http(s) URLs', () => {
    expect(CreateJob.safeParse({ ...minimal, originalUrl: 'http://example.com' }).success).toBe(
      true,
    );
    for (const url of ['javascript:alert(1)', 'ftp://example.com/x', 'not a url']) {
      expect(CreateJob.safeParse({ ...minimal, originalUrl: url }).success, url).toBe(false);
    }
  });

  it('salary = { min?, max?, currency, period } (06 §1; the M1-04 rule is structural)', () => {
    expect(
      CreateJob.parse({ ...minimal, salary: { min: 1, currency: 'USD', period: 'YEAR' } }),
    ).toEqual({
      ...minimal,
      salary: { min: 1, currency: 'USD', period: 'YEAR' },
    });
    expect(CreateJob.safeParse({ ...minimal, salary: null }).success).toBe(true);
    const r = CreateJob.safeParse({ ...minimal, salary: { min: 4000 } });
    expect(issuePaths(r)).toEqual(expect.arrayContaining(['salary.currency', 'salary.period']));
    expect(CreateJob.safeParse({ ...minimal, salary: { max: 1, currency: 'USD' } }).success).toBe(
      false,
    );
  });

  it('salary needs at least one amount; min ≤ max; amounts are non-negative integers (= DB CHECKs)', () => {
    const none = CreateJob.safeParse({ ...minimal, salary: { currency: 'EUR', period: 'MONTH' } });
    expect(issuePaths(none)).toEqual(['salary']);
    const r = CreateJob.safeParse({ ...minimal, salary: { ...salary, min: 7000 } });
    expect(issuePaths(r)).toEqual(['salary.max']);
    expect(CreateJob.safeParse({ ...minimal, salary: { ...salary, min: 6000 } }).success).toBe(
      true,
    );
    expect(CreateJob.safeParse({ ...minimal, salary: { ...salary, min: -1 } }).success).toBe(false);
    expect(CreateJob.safeParse({ ...minimal, salary: { ...salary, min: 1.5 } }).success).toBe(
      false,
    );
    expect(CreateJob.safeParse({ ...minimal, salary: { ...salary, extra: 1 } }).success).toBe(
      false,
    );
  });

  it('amounts are bounded to int32 (Prisma Int)', () => {
    const at = (max: number) =>
      CreateJob.safeParse({ ...minimal, salary: { ...salary, min: 0, max } });
    expect(at(2_147_483_647).success).toBe(true);
    expect(at(2_147_483_648).success).toBe(false);
  });

  it('blank optional free text becomes null (no empty strings stored)', () => {
    expect(CreateJob.parse({ ...minimal, locationText: '' }).locationText).toBeNull();
    expect(CreateJob.parse({ ...minimal, locationText: '  Kyiv ' }).locationText).toBe('Kyiv');
    expect(UpdateJob.parse({ locationText: '   ' })).toEqual({ locationText: null });
  });

  it('request JSON Schema (io: input) is representable for nestjs-zod OpenAPI', () => {
    expect(() => z.toJSONSchema(CreateJob, { io: 'input' })).not.toThrow();
    expect(() => z.toJSONSchema(UpdateJob, { io: 'input' })).not.toThrow();
  });

  it('rejects the flat salary columns', () => {
    for (const key of [
      'salaryMin',
      'salaryMax',
      'salaryCurrency',
      'salaryPeriod',
      'salaryIsGross',
    ]) {
      expect(CreateJob.safeParse({ ...minimal, [key]: 1 }).success, key).toBe(false);
    }
  });

  it('rejects enum values outside the DB set and malformed ISO codes', () => {
    expect(CreateJob.safeParse({ ...minimal, workMode: 'OFFICE' }).success).toBe(false);
    expect(CreateJob.safeParse({ ...minimal, countryCode: 'ua' }).success).toBe(false);
    expect(
      CreateJob.safeParse({ ...minimal, salary: { ...salary, currency: 'usd' } }).success,
    ).toBe(false);
    expect(
      CreateJob.safeParse({ ...minimal, salary: { ...salary, period: 'DECADE' } }).success,
    ).toBe(false);
  });
});

describe('UpdateJob', () => {
  it('accepts a non-empty subset and null to clear optional fields', () => {
    expect(UpdateJob.parse({ title: 'New' })).toEqual({ title: 'New' });
    expect(UpdateJob.parse({ locationText: null, workMode: null })).toEqual({
      locationText: null,
      workMode: null,
    });
  });

  it('rejects an empty body, unknown keys and null for required fields', () => {
    expect(UpdateJob.safeParse({}).success).toBe(false);
    expect(UpdateJob.safeParse({ ownerId: id }).success).toBe(false);
    expect(UpdateJob.safeParse({ title: null }).success).toBe(false);
  });

  it('salary: null clears, an object replaces the whole range (same rules), omitted = unchanged', () => {
    expect(UpdateJob.parse({ salary: null })).toEqual({ salary: null });
    expect(UpdateJob.parse({ salary })).toEqual({ salary });
    expect(UpdateJob.parse({ salary: { ...salary, isGross: null } })).toEqual({
      salary: { ...salary, isGross: null },
    });
    expect(UpdateJob.safeParse({ salary: { max: 5000 } }).success).toBe(false);
    expect(UpdateJob.safeParse({ salary: { ...salary, min: 9000 } }).success).toBe(false);
  });
});

describe('Job (response)', () => {
  const job = {
    id,
    visibility: 'PRIVATE',
    companyName: 'Acme',
    title: 'Dev',
    descriptionText: '',
    locationText: null,
    countryCode: null,
    workMode: null,
    employmentType: null,
    seniority: null,
    englishLevel: null,
    salary: null,
    originalUrl: null,
    canonicalUrl: null,
    status: 'OPEN',
    extractionMethod: 'MANUAL',
    createdAt: '2026-11-19T10:00:00.000Z',
    updatedAt: '2026-11-19T10:00:00.000Z',
  };

  it('parses a job; unknown keys are stripped, so owner/internal fields never reach the client', () => {
    expect(Job.parse(job)).toEqual(job);
    const parsed = Job.parse({ ...job, ownerId: id, normalizedTitle: 'dev', userId: id, extra: 1 });
    for (const key of ['ownerId', 'normalizedTitle', 'userId', 'extra']) {
      expect(parsed, key).not.toHaveProperty(key);
    }
    expect(parsed).toEqual(job);
  });

  it('response JSON Schema is representable (OpenAPI)', () => {
    expect(() => z.toJSONSchema(Job, { io: 'output' })).not.toThrow();
  });

  it('salary is null or { min, max, currency, period, isGross } with nulls, never omitted keys', () => {
    const withSalary = {
      ...job,
      salary: { min: null, max: 5000, currency: 'USD', period: 'MONTH', isGross: null },
    };
    expect(Job.parse(withSalary)).toEqual(withSalary);
    expect(
      Job.safeParse({ ...job, salary: { max: 5000, currency: 'USD', period: 'MONTH' } }).success,
    ).toBe(false);
    expect(Job.parse({ ...job, salaryMin: 1 })).not.toHaveProperty('salaryMin');
  });

  it('requires null rather than an omitted field (06 §1)', () => {
    const rest: Record<string, unknown> = { ...job };
    delete rest.locationText;
    expect(Job.safeParse(rest).success).toBe(false);
  });

  it('409 CONFLICT_DUPLICATE_JOB details carry existingJobId', () => {
    expect(DuplicateJobDetails.parse({ existingJobId: id })).toEqual({ existingJobId: id });
    expect(DuplicateJobDetails.safeParse({}).success).toBe(false);
  });
});
