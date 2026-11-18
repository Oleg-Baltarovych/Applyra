import { describe, expect, it } from 'vitest';
import { toSettingsUpdate } from './settings.domain.js';

describe('toSettingsUpdate', () => {
  it('confirms the timezone whenever the patch sets it', () => {
    expect(toSettingsUpdate({ timezone: 'UTC' })).toEqual({
      timezone: 'UTC',
      timezoneConfirmed: true,
    });
    expect(toSettingsUpdate({ timezone: 'Europe/Kyiv', staleGhostDays: 30 })).toEqual({
      timezone: 'Europe/Kyiv',
      staleGhostDays: 30,
      timezoneConfirmed: true,
    });
  });

  it('leaves the confirmation untouched when the patch has no timezone', () => {
    expect(toSettingsUpdate({ hotkeysEnabled: false, staleFollowUpDays: 3 })).toEqual({
      hotkeysEnabled: false,
      staleFollowUpDays: 3,
    });
  });
});
