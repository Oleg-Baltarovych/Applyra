import { describe, expect, it } from 'vitest';
import {
  IanaTimeZone,
  Me,
  STALE_DAYS_LIMITS,
  UpdateUserSettings,
  UserSettings,
} from '../src/index.js';

const settings = {
  timezone: 'UTC',
  timezoneConfirmed: false,
  staleFollowUpDays: 7,
  staleDaysAfterInterview: 10,
  staleGhostDays: 21,
  hotkeysEnabled: true,
};

const issuePaths = (input: unknown): string[] => {
  const result = UpdateUserSettings.safeParse(input);
  if (result.success) return [];
  // An unknown key is reported once on the object, naming the keys (the API maps each key to its own detail path).
  return result.error.issues.flatMap((i) =>
    i.code === 'unrecognized_keys'
      ? i.keys.map((k) => [...i.path, k].join('.'))
      : [i.path.join('.')],
  );
};

describe('IanaTimeZone', () => {
  it.each(['Europe/Kyiv', 'America/Argentina/Buenos_Aires', 'UTC', 'Etc/GMT-3', 'Asia/Kolkata'])(
    'accepts %s as sent (a well-cased IANA id is never rewritten to an engine alias)',
    (zone) => {
      expect(IanaTimeZone.parse(zone)).toBe(zone);
    },
  );

  it.each(['utc', 'Utc', 'UTC'])('case-folds %s to UTC (the DB default spelling)', (input) => {
    expect(IanaTimeZone.parse(input)).toBe('UTC');
  });

  it.each(['europe/kyiv', 'europe/berlin', 'ETC/GMT-3', 'asia/kolkata'])(
    'accepts %s and stores it as sent (no case or alias canonicalisation besides UTC)',
    (zone) => {
      expect(IanaTimeZone.parse(zone)).toBe(zone);
    },
  );

  it.each([
    'Mars/Base',
    '+02:00',
    '-0500',
    'GMT+7',
    '',
    ' Europe/Kyiv',
    'Europe//Kyiv',
    `Europe/${'A'.repeat(60)}`,
  ])('rejects %j', (zone) => {
    expect(IanaTimeZone.safeParse(zone).success).toBe(false);
  });

  it('rejects non-strings', () => {
    for (const value of [null, 3, undefined, {}]) {
      expect(IanaTimeZone.safeParse(value).success).toBe(false);
    }
  });
});

describe('UpdateUserSettings', () => {
  it('accepts any non-empty subset and returns only the passed keys', () => {
    expect(UpdateUserSettings.parse({ staleGhostDays: 30 })).toEqual({ staleGhostDays: 30 });
    expect(
      UpdateUserSettings.parse({
        timezone: 'utc',
        staleFollowUpDays: 1,
        staleDaysAfterInterview: 90,
        staleGhostDays: 180,
        hotkeysEnabled: false,
      }),
    ).toEqual({
      timezone: 'UTC',
      staleFollowUpDays: 1,
      staleDaysAfterInterview: 90,
      staleGhostDays: 180,
      hotkeysEnabled: false,
    });
  });

  it('rejects an empty patch', () => {
    expect(UpdateUserSettings.safeParse({}).success).toBe(false);
  });

  it.each(['userId', 'updatedAt', 'timezoneConfirmed', 'role'])(
    'rejects the unknown key %s with its path',
    (key) => {
      expect(issuePaths({ hotkeysEnabled: true, [key]: 'x' })).toEqual([key]);
    },
  );

  it.each([
    'timezone',
    'staleFollowUpDays',
    'staleDaysAfterInterview',
    'staleGhostDays',
    'hotkeysEnabled',
  ])('rejects null for %s (no field is nullable)', (key) => {
    expect(issuePaths({ [key]: null })).toEqual([key]);
  });

  it.each([
    ['staleFollowUpDays', 0],
    ['staleFollowUpDays', 91],
    ['staleDaysAfterInterview', 0],
    ['staleDaysAfterInterview', 91],
    ['staleGhostDays', 0],
    ['staleGhostDays', 181],
    ['staleGhostDays', 7.5],
    ['staleFollowUpDays', '7'],
    ['hotkeysEnabled', 'true'],
  ])('rejects %s = %j', (key, value) => {
    expect(issuePaths({ [key]: value })).toEqual([key]);
  });

  it('bounds equal the DB CHECK user_settings_ranges_chk', () => {
    expect(STALE_DAYS_LIMITS).toEqual({
      staleFollowUpDays: { min: 1, max: 90 },
      staleDaysAfterInterview: { min: 1, max: 90 },
      staleGhostDays: { min: 1, max: 180 },
    });
  });

  it('reports a bad timezone under the timezone path', () => {
    expect(issuePaths({ timezone: 'Mars/Base' })).toEqual(['timezone']);
  });
});

describe('Me / UserSettings', () => {
  const me = {
    user: {
      id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      email: 'user-a@example.test',
      name: 'User A',
      image: null,
      createdAt: '2026-11-18T10:00:00.000Z',
    },
    settings,
  };

  it('accepts the wire shape', () => {
    expect(Me.parse(me)).toEqual(me);
    expect(UserSettings.parse(settings)).toEqual(settings);
  });

  it('is closed: role, deletedAt or userId are not part of it', () => {
    expect(Me.safeParse({ ...me, user: { ...me.user, role: 'ADMIN' } }).success).toBe(false);
    expect(Me.safeParse({ ...me, user: { ...me.user, deletedAt: null } }).success).toBe(false);
    expect(UserSettings.safeParse({ ...settings, userId: me.user.id }).success).toBe(false);
  });

  it('requires an ISO timestamp for createdAt', () => {
    expect(Me.safeParse({ ...me, user: { ...me.user, createdAt: 'yesterday' } }).success).toBe(
      false,
    );
  });
});
