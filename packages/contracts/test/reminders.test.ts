import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CreateReminder,
  Reminder,
  ReminderListItem,
  ReminderListQuery,
  SnoozeReminder,
  UpdateReminder,
} from '../src/index.js';

const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const at = '2026-11-20T09:00:00.000Z';

describe('CreateReminder (06 §7.4, R0 = next action only)', () => {
  const body = {
    applicationId: id,
    kind: 'FOLLOW_UP',
    title: 'Ping recruiter',
    dueAt: at,
    asNextAction: true,
  };

  it('accepts a next-action reminder', () => {
    expect(CreateReminder.parse(body)).toEqual(body);
  });

  it('R0 requires applicationId and asNextAction = true', () => {
    const noApp: Record<string, unknown> = { ...body };
    delete noApp.applicationId;
    expect(CreateReminder.safeParse(noApp).success).toBe(false);
    expect(CreateReminder.safeParse({ ...body, asNextAction: false }).success).toBe(false);
    const noFlag: Record<string, unknown> = { ...body };
    delete noFlag.asNextAction;
    expect(CreateReminder.safeParse(noFlag).success).toBe(false);
  });

  it('is strict and bounded: no userId/source/status; title 1..300', () => {
    for (const key of ['userId', 'source', 'status', 'snoozeCount']) {
      expect(CreateReminder.safeParse({ ...body, [key]: 'x' }).success, key).toBe(false);
    }
    expect(CreateReminder.safeParse({ ...body, title: 'a'.repeat(300) }).success).toBe(true);
    expect(CreateReminder.safeParse({ ...body, title: 'a'.repeat(301) }).success).toBe(false);
    expect(CreateReminder.safeParse({ ...body, title: ' ' }).success).toBe(false);
    expect(CreateReminder.safeParse({ ...body, kind: 'BIRTHDAY' }).success).toBe(false);
  });
});

describe('UpdateReminder (FR-REM-03)', () => {
  it('accepts title/dueAt edits and DONE/CANCELLED', () => {
    expect(UpdateReminder.safeParse({ title: 'x' }).success).toBe(true);
    expect(UpdateReminder.safeParse({ status: 'CANCELLED' }).success).toBe(true);
    expect(UpdateReminder.parse({ status: 'DONE', followedUp: true })).toEqual({
      status: 'DONE',
      followedUp: true,
    });
  });

  it('rejects PENDING, an empty body, followedUp without DONE and unknown keys', () => {
    expect(UpdateReminder.safeParse({ status: 'PENDING' }).success).toBe(false);
    expect(UpdateReminder.safeParse({}).success).toBe(false);
    expect(UpdateReminder.safeParse({ followedUp: true }).success).toBe(false);
    expect(UpdateReminder.safeParse({ status: 'CANCELLED', followedUp: true }).success).toBe(false);
    expect(UpdateReminder.safeParse({ snoozeCount: 0 }).success).toBe(false);
  });
});

describe('SnoozeReminder', () => {
  it('accepts a preset or an until datetime, not both', () => {
    expect(SnoozeReminder.parse({ preset: '1d' })).toEqual({ preset: '1d' });
    expect(SnoozeReminder.parse({ until: at })).toEqual({ until: at });
    expect(SnoozeReminder.safeParse({ preset: '1d', until: at }).success).toBe(false);
    expect(SnoozeReminder.safeParse({ preset: '7d' }).success).toBe(false);
    expect(SnoozeReminder.safeParse({}).success).toBe(false);
  });
});

describe('ReminderListQuery', () => {
  it('request JSON Schemas (io: input) are representable', () => {
    for (const schema of [ReminderListQuery, CreateReminder, UpdateReminder, SnoozeReminder]) {
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
    }
  });

  it('requires a known range', () => {
    expect(ReminderListQuery.parse({ range: 'overdue' })).toEqual({ range: 'overdue' });
    expect(ReminderListQuery.safeParse({}).success).toBe(false);
    expect(ReminderListQuery.safeParse({ range: 'week' }).success).toBe(false);
  });
});

describe('Reminder (response)', () => {
  const reminder = {
    id,
    applicationId: id,
    source: 'NEXT_ACTION',
    kind: 'FOLLOW_UP',
    title: 'Ping',
    dueAt: at,
    status: 'PENDING',
    snoozeCount: 0,
    completedAt: null,
    createdAt: at,
    updatedAt: at,
  };

  it('parses a reminder; userId is stripped, never returned', () => {
    expect(Reminder.parse(reminder)).toEqual(reminder);
    expect(Reminder.parse({ ...reminder, userId: id })).not.toHaveProperty('userId');
  });

  it('list item adds the application reference for the Today screen', () => {
    const item = { ...reminder, application: { id, companyName: 'Acme', roleTitle: 'Dev' } };
    expect(ReminderListItem.parse(item)).toEqual(item);
    expect(ReminderListItem.safeParse({ ...item, application: null }).success).toBe(true);
  });
});
