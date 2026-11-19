import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ActiveApplicationDetails,
  Application,
  ApplicationDetail,
  ApplicationEvent,
  ApplicationKanban,
  ApplicationListQuery,
  ApplicationStatus,
  BulkArchiveApplications,
  BulkArchiveResult,
  CreateApplication,
  CreateApplicationEvent,
  TERMINAL_STATUSES,
  TransitionApplication,
  UpdateApplication,
} from '../src/index.js';

const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const id2 = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const at = '2026-11-19T10:00:00.000Z';

describe('ApplicationStatus (FR-APP-03)', () => {
  it('lists the pipeline in order and the terminal statuses', () => {
    expect(ApplicationStatus.options).toEqual([
      'WISHLIST',
      'APPLIED',
      'SCREENING',
      'INTERVIEW',
      'TEST_TASK',
      'OFFER',
      'ACCEPTED',
      'REJECTED',
      'WITHDRAWN',
      'GHOSTED',
    ]);
    expect(TERMINAL_STATUSES).toEqual(['REJECTED', 'WITHDRAWN', 'GHOSTED']);
  });
});

describe('CreateApplication (FR-APP-01/02)', () => {
  it('accepts jobId, an inline job, or companyName + roleTitle without a job', () => {
    expect(CreateApplication.safeParse({ jobId: id }).success).toBe(true);
    expect(
      CreateApplication.safeParse({ job: { title: 'Dev', companyName: 'Acme' } }).success,
    ).toBe(true);
    expect(
      CreateApplication.parse({ companyName: ' Acme ', roleTitle: 'Dev', channel: 'TELEGRAM' }),
    ).toEqual({
      companyName: 'Acme',
      roleTitle: 'Dev',
      channel: 'TELEGRAM',
    });
  });

  it('with a job the snapshot may still be overridden (06 §7.3 only requires it without a job)', () => {
    expect(
      CreateApplication.parse({ jobId: id, companyName: 'Acme Ltd', roleTitle: 'Dev' }),
    ).toEqual({
      jobId: id,
      companyName: 'Acme Ltd',
      roleTitle: 'Dev',
    });
  });

  it('blank notes become null; salary amounts are int32-bounded', () => {
    expect(CreateApplication.parse({ jobId: id, notes: '  ' }).notes).toBeNull();
    const amount = (expected: number) =>
      CreateApplication.safeParse({ jobId: id, salary: { expected, currency: 'USD' } }).success;
    expect(amount(2_147_483_647)).toBe(true);
    expect(amount(2_147_483_648)).toBe(false);
  });

  it('without a job requires companyName and roleTitle (issues on those paths)', () => {
    const r = CreateApplication.safeParse({ companyName: 'Acme' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(['roleTitle']);
    expect(CreateApplication.safeParse({}).success).toBe(false);
  });

  it('rejects jobId together with an inline job', () => {
    expect(
      CreateApplication.safeParse({ jobId: id, job: { title: 'Dev', companyName: 'Acme' } })
        .success,
    ).toBe(false);
  });

  it('validates the inline job with the job form rules (salary refine)', () => {
    expect(
      CreateApplication.safeParse({
        job: { title: 'Dev', companyName: 'Acme', salary: { min: 1 } },
      }).success,
    ).toBe(false);
    expect(
      CreateApplication.safeParse({ job: { title: 'Dev', companyName: 'Acme', ownerId: id } })
        .success,
    ).toBe(false);
  });

  it('is strict: no userId/ownerId/role/status/nextAction*', () => {
    for (const key of [
      'userId',
      'ownerId',
      'role',
      'status',
      'nextActionText',
      'archivedAt',
      'importKey',
    ]) {
      expect(CreateApplication.safeParse({ jobId: id, [key]: 'x' }).success, key).toBe(false);
    }
  });

  it('limits: notes ≤ 50 000, companyName/roleTitle ≤ 300', () => {
    const base = { companyName: 'Acme', roleTitle: 'Dev' };
    expect(CreateApplication.safeParse({ ...base, notes: 'a'.repeat(50_000) }).success).toBe(true);
    expect(CreateApplication.safeParse({ ...base, notes: 'a'.repeat(50_001) }).success).toBe(false);
    expect(CreateApplication.safeParse({ ...base, roleTitle: 'a'.repeat(301) }).success).toBe(
      false,
    );
  });

  it('salary = { expected?, offered?, currency, period? } (mirrors application_salary_currency_chk)', () => {
    const base = { jobId: id };
    const ok = { expected: 5000, currency: 'USD' };
    expect(CreateApplication.parse({ ...base, salary: ok })).toEqual({ ...base, salary: ok });
    expect(
      CreateApplication.safeParse({ ...base, salary: { ...ok, period: 'MONTH' } }).success,
    ).toBe(true);
    expect(CreateApplication.safeParse({ ...base, salary: { ...ok, period: null } }).success).toBe(
      true,
    );
    expect(CreateApplication.safeParse({ ...base, salary: { expected: 5000 } }).success).toBe(
      false,
    );
    const none = CreateApplication.safeParse({ ...base, salary: { currency: 'USD' } });
    expect(none.error?.issues.map((i) => i.path.join('.'))).toEqual(['salary']);
    expect(
      CreateApplication.safeParse({ ...base, salary: { offered: -1, currency: 'USD' } }).success,
    ).toBe(false);
    expect(CreateApplication.safeParse({ ...base, salaryExpected: 5000 }).success).toBe(false);
  });

  it('appliedAt is an ISO UTC datetime', () => {
    expect(CreateApplication.safeParse({ jobId: id, appliedAt: at }).success).toBe(true);
    expect(CreateApplication.safeParse({ jobId: id, appliedAt: '2026-11-19' }).success).toBe(false);
  });
});

describe('UpdateApplication', () => {
  it('accepts a non-empty subset; jobId may be cleared', () => {
    expect(UpdateApplication.parse({ priority: 'HIGH' })).toEqual({ priority: 'HIGH' });
    expect(UpdateApplication.parse({ jobId: null, channel: null })).toEqual({
      jobId: null,
      channel: null,
    });
  });

  it('rejects status, nextAction*, an empty body and null snapshot fields', () => {
    expect(UpdateApplication.safeParse({}).success).toBe(false);
    expect(UpdateApplication.safeParse({ status: 'APPLIED' }).success).toBe(false);
    expect(UpdateApplication.safeParse({ nextActionAt: at }).success).toBe(false);
    expect(UpdateApplication.safeParse({ userId: id }).success).toBe(false);
    expect(UpdateApplication.safeParse({ companyName: null }).success).toBe(false);
  });

  it('salary: null clears, an object replaces it, omitted = unchanged', () => {
    expect(UpdateApplication.parse({ salary: null })).toEqual({ salary: null });
    const salary = { expected: 1, offered: 2, currency: 'EUR', period: 'MONTH' };
    expect(UpdateApplication.parse({ salary })).toEqual({ salary });
    expect(UpdateApplication.safeParse({ salary: { expected: 1 } }).success).toBe(false);
    expect(UpdateApplication.safeParse({ salaryExpected: 1 }).success).toBe(false);
  });
});

describe('TransitionApplication (FR-APP-03)', () => {
  it('accepts toStatus with optional occurredAt and note', () => {
    expect(TransitionApplication.parse({ toStatus: 'APPLIED' })).toEqual({ toStatus: 'APPLIED' });
    expect(
      TransitionApplication.safeParse({ toStatus: 'OFFER', occurredAt: at, note: 'yay' }).success,
    ).toBe(true);
  });

  it('a blank note is dropped to null', () => {
    expect(TransitionApplication.parse({ toStatus: 'APPLIED', note: ' ' }).note).toBeNull();
  });

  it('rejects unknown status, fromStatus and extra keys', () => {
    expect(TransitionApplication.safeParse({ toStatus: 'HIRED' }).success).toBe(false);
    expect(
      TransitionApplication.safeParse({ toStatus: 'APPLIED', fromStatus: 'WISHLIST' }).success,
    ).toBe(false);
    expect(TransitionApplication.safeParse({}).success).toBe(false);
  });
});

describe('CreateApplicationEvent (FR-APP-10)', () => {
  it('allows only NOTE / MESSAGE_LOGGED / FOLLOW_UP_SENT', () => {
    expect(
      CreateApplicationEvent.safeParse({ type: 'NOTE', text: 'hi', occurredAt: at }).success,
    ).toBe(true);
    expect(CreateApplicationEvent.safeParse({ type: 'FOLLOW_UP_SENT' }).success).toBe(true);
    for (const type of ['STATUS_CHANGED', 'CREATED', 'ARCHIVED', 'INTERVIEW_SCHEDULED']) {
      expect(CreateApplicationEvent.safeParse({ type, text: 'x' }).success, type).toBe(false);
    }
  });

  it('NOTE needs text; text ≤ 50 000', () => {
    expect(CreateApplicationEvent.safeParse({ type: 'NOTE' }).success).toBe(false);
    expect(CreateApplicationEvent.safeParse({ type: 'NOTE', text: '  ' }).success).toBe(false);
    expect(
      CreateApplicationEvent.safeParse({ type: 'NOTE', text: 'a'.repeat(50_001) }).success,
    ).toBe(false);
    expect(
      CreateApplicationEvent.safeParse({ type: 'NOTE', text: 'x', actor: 'SYSTEM' }).success,
    ).toBe(false);
  });
});

describe('BulkArchiveApplications (06 §5)', () => {
  it('takes 1..100 uuids', () => {
    expect(BulkArchiveApplications.safeParse({ ids: [id] }).success).toBe(true);
    expect(
      BulkArchiveApplications.safeParse({ ids: Array.from({ length: 100 }, () => id) }).success,
    ).toBe(true);
    expect(
      BulkArchiveApplications.safeParse({ ids: Array.from({ length: 101 }, () => id) }).success,
    ).toBe(false);
    expect(BulkArchiveApplications.safeParse({ ids: [] }).success).toBe(false);
    expect(BulkArchiveApplications.safeParse({ ids: ['nope'] }).success).toBe(false);
  });

  it('result = { archived, notFound[] }', () => {
    expect(BulkArchiveResult.parse({ archived: 1, notFound: [id2] })).toEqual({
      archived: 1,
      notFound: [id2],
    });
  });
});

describe('ApplicationListQuery (06 §7.3)', () => {
  it('defaults: list view, archived=false, sort updatedAt desc, limit 25', () => {
    expect(ApplicationListQuery.parse({})).toEqual({
      view: 'list',
      archived: false,
      sort: 'updatedAt',
      dir: 'desc',
      limit: 25,
    });
  });

  it('accepts an empty ?q= as no search', () => {
    expect(ApplicationListQuery.parse({ q: '' }).q).toBeUndefined();
    expect(ApplicationListQuery.parse({ q: '  acme ' }).q).toBe('acme');
  });

  it('request JSON Schema (io: input) is representable for nestjs-zod OpenAPI', () => {
    for (const schema of [
      ApplicationListQuery,
      CreateApplication,
      UpdateApplication,
      TransitionApplication,
      CreateApplicationEvent,
      BulkArchiveApplications,
    ]) {
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
    }
  });

  it('parses a single or repeated status and string booleans', () => {
    expect(ApplicationListQuery.parse({ status: 'APPLIED' }).status).toEqual(['APPLIED']);
    expect(ApplicationListQuery.parse({ status: ['APPLIED', 'OFFER'] }).status).toEqual([
      'APPLIED',
      'OFFER',
    ]);
    expect(ApplicationListQuery.parse({ archived: 'true' }).archived).toBe(true);
    expect(ApplicationListQuery.parse({ archived: 'false' }).archived).toBe(false);
  });

  it('rejects bad enum values, limit > 100, a cursor with view=kanban and unknown keys', () => {
    expect(ApplicationListQuery.safeParse({ status: 'HIRED' }).success).toBe(false);
    expect(ApplicationListQuery.safeParse({ sort: 'salary' }).success).toBe(false);
    expect(ApplicationListQuery.safeParse({ limit: '101' }).success).toBe(false);
    expect(ApplicationListQuery.safeParse({ view: 'kanban', cursor: 'abc' }).success).toBe(false);
    expect(ApplicationListQuery.safeParse({ userId: id }).success).toBe(false);
    expect(ApplicationListQuery.safeParse({ q: 'a'.repeat(201) }).success).toBe(false);
  });
});

const application = {
  id,
  jobId: null,
  companyName: 'Acme',
  roleTitle: 'Dev',
  origin: 'SELF_APPLIED',
  channel: null,
  status: 'WISHLIST',
  priority: 'NORMAL',
  appliedAt: null,
  lastActivityAt: at,
  nextAction: null,
  salary: null,
  notes: null,
  archivedAt: null,
  daysSinceActivity: 0,
  isStale: false,
  createdAt: at,
  updatedAt: at,
};

describe('Application (response)', () => {
  it('parses an item; next action is { text, dueAt } or null', () => {
    expect(Application.parse(application)).toEqual(application);
    const withNext = { ...application, nextAction: { text: 'Follow up', dueAt: at } };
    expect(Application.parse(withNext)).toEqual(withNext);
  });

  it('salary is null or { expected, offered, currency, period } with nulls', () => {
    const withSalary = {
      ...application,
      salary: { expected: 5000, offered: null, currency: 'USD', period: null },
    };
    expect(Application.parse(withSalary)).toEqual(withSalary);
    expect(
      Application.safeParse({ ...application, salary: { expected: 1, currency: 'USD' } }).success,
    ).toBe(false);
  });

  it('strips unknown keys: userId / importKey / raw nextAction* never reach the client', () => {
    const parsed = Application.parse({
      ...application,
      userId: id,
      importKey: 'k',
      nextActionText: 'x',
    });
    for (const key of ['userId', 'importKey', 'nextActionText']) {
      expect(parsed, key).not.toHaveProperty(key);
    }
    expect(parsed).toEqual(application);
  });

  it('response JSON Schemas are representable (OpenAPI)', () => {
    for (const schema of [Application, ApplicationDetail, ApplicationKanban, ApplicationEvent]) {
      expect(() => z.toJSONSchema(schema, { io: 'output' })).not.toThrow();
    }
  });

  it('detail adds the open NEXT_ACTION reminder id', () => {
    expect(
      ApplicationDetail.safeParse({ ...application, nextActionReminderId: null }).success,
    ).toBe(true);
    expect(ApplicationDetail.safeParse(application).success).toBe(false);
  });

  it('kanban groups items by status and flags truncation (≤ 500)', () => {
    const board = { columns: [{ status: 'WISHLIST', items: [application] }], truncated: false };
    expect(ApplicationKanban.parse(board)).toEqual(board);
  });

  it('409 CONFLICT_ACTIVE_APPLICATION details carry existingApplicationId', () => {
    expect(ActiveApplicationDetails.parse({ existingApplicationId: id })).toEqual({
      existingApplicationId: id,
    });
  });
});

describe('ApplicationEvent (response, discriminated by type)', () => {
  const base = {
    id,
    applicationId: id2,
    actor: 'USER',
    occurredAt: at,
    editedAt: null,
    createdAt: at,
  };

  it('STATUS_CHANGED carries from/to and an optional note payload', () => {
    const e = {
      ...base,
      type: 'STATUS_CHANGED',
      fromStatus: 'WISHLIST',
      toStatus: 'APPLIED',
      payload: null,
    };
    expect(ApplicationEvent.parse(e)).toEqual(e);
    expect(ApplicationEvent.safeParse({ ...e, payload: { note: 'sent CV' } }).success).toBe(true);
    expect(ApplicationEvent.safeParse({ ...e, fromStatus: null }).success).toBe(false);
  });

  it('NOTE always carries { text }; no statuses', () => {
    const e = { ...base, type: 'NOTE', fromStatus: null, toStatus: null, payload: { text: 'hi' } };
    expect(ApplicationEvent.parse(e)).toEqual(e);
    expect(ApplicationEvent.safeParse({ ...e, payload: null }).success).toBe(false);
    expect(ApplicationEvent.safeParse({ ...e, toStatus: 'APPLIED' }).success).toBe(false);
    expect(ApplicationEvent.safeParse({ ...e, payload: { note: 'x' } }).success).toBe(false);
  });

  it('MESSAGE_LOGGED / FOLLOW_UP_SENT carry { text } or null', () => {
    for (const type of ['MESSAGE_LOGGED', 'FOLLOW_UP_SENT']) {
      const e = { ...base, type, fromStatus: null, toStatus: null, payload: null };
      expect(ApplicationEvent.parse(e), type).toEqual(e);
      expect(ApplicationEvent.safeParse({ ...e, payload: { text: 'x' } }).success, type).toBe(true);
    }
  });

  it('lifecycle events (CREATED, ARCHIVED, UNARCHIVED) have a null payload', () => {
    const e = { ...base, type: 'ARCHIVED', fromStatus: null, toStatus: null, payload: null };
    expect(ApplicationEvent.parse(e)).toEqual(e);
    expect(ApplicationEvent.safeParse({ ...e, payload: { text: 'x' } }).success).toBe(false);
    const created = { ...e, type: 'CREATED' };
    expect(ApplicationEvent.parse(created)).toEqual(created);
    expect(ApplicationEvent.safeParse({ ...created, payload: { text: 'x' } }).success).toBe(false);
  });
});
