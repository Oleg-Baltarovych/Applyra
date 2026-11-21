import { describe, expect, it } from 'vitest';
import { callbackData, NOOP, parseCallback, statusKeyboard } from '../src/status.ts';

describe('status callback data', () => {
  it('round-trips status code and vacancy id', () => {
    for (const id of [
      'dou:356709',
      'linkedin:4012345678',
      'fake:0123456789abcdef',
      'workua:7123456',
    ])
      expect(parseCallback(callbackData('p', id))).toEqual({ code: 'p', vacancyId: id });
  });
  it('rejects anything else, including forged or oversized data', () => {
    for (const data of [
      NOOP,
      's:z:dou:1',
      's:a:dou',
      's:a:DOU:1',
      's:a:dou:1;drop',
      `s:a:dou:${'1'.repeat(41)}`,
      'x:a:dou:1',
      '',
    ])
      expect(parseCallback(data)).toBeUndefined();
  });
});

describe('statusKeyboard', () => {
  it('offers the four statuses in two rows', () => {
    expect(statusKeyboard('dou:1')).toEqual({
      inline_keyboard: [
        [
          { text: '✅ Відгукнувся', callback_data: 's:a:dou:1' },
          { text: '🔄 В процесі', callback_data: 's:p:dou:1' },
        ],
        [
          { text: '❌ Відмова', callback_data: 's:r:dou:1' },
          { text: '🚫 Не цікаво', callback_data: 's:x:dou:1' },
        ],
      ],
    });
  });
  it('shows the current status with its date (Kyiv) in a no-op row on top', () => {
    const kb = statusKeyboard('dou:1', { code: 'p', at: new Date('2026-11-20T23:30:00Z') });
    expect(kb?.inline_keyboard[0]).toEqual([
      { text: 'Статус: 🔄 В процесі · 21.11', callback_data: NOOP },
    ]);
    expect(kb?.inline_keyboard).toHaveLength(3);
  });
  it('has no buttons for an id that cannot be encoded', () => {
    expect(statusKeyboard(`dou:${'9'.repeat(60)}`)).toBeUndefined();
    expect(statusKeyboard('weird id')).toBeUndefined();
  });
});
