// MSW handler + payload factories for tests only, typed by @applyra/contracts.
import { type ApiError, type ErrorCode, type Me, errorStatus } from '@applyra/contracts';
import { HttpResponse, http } from 'msw';

export const API = 'http://localhost:3000/api/v1';
export const AUTH = 'http://localhost:3000/api/auth';

export function buildMe(
  overrides: { user?: Partial<Me['user']>; settings?: Partial<Me['settings']> } = {},
): Me {
  return {
    user: {
      id: '0196f6d2-7c1a-7d4e-9a3b-1c2d3e4f5a6b',
      email: 'user-a@example.com',
      name: 'User A',
      image: null,
      createdAt: '2026-11-01T10:00:00.000Z',
      ...overrides.user,
    },
    settings: {
      timezone: 'UTC',
      timezoneConfirmed: true,
      staleFollowUpDays: 7,
      staleDaysAfterInterview: 5,
      staleGhostDays: 21,
      hotkeysEnabled: true,
      ...overrides.settings,
    },
  };
}

export function apiError(code: Exclude<ErrorCode, 'VALIDATION_ERROR'>, requestId = 'req-test') {
  const body: ApiError = {
    statusCode: errorStatus[code],
    code,
    message: `${code} message`,
    requestId,
    details: null,
  };
  return HttpResponse.json(body, {
    status: errorStatus[code],
    headers: { 'X-Request-Id': requestId },
  });
}

export const meSignedIn = (me: Me = buildMe()) =>
  http.get(`${API}/me`, () => HttpResponse.json(me));
export const meSignedOut = () => http.get(`${API}/me`, () => apiError('UNAUTHENTICATED'));
