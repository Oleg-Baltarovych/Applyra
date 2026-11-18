// Only Prisma access of the users module. Every query is keyed by the session user's id (findOwned*/updateOwned*).
import type { MeUser, UserSettings } from '@applyra/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { type AppPrisma, clientFor, PRISMA, type Tx } from '../../platform/prisma/index.js';
import type { SettingsUpdate } from './settings.domain.js';

/** The user columns /me exposes (least data: no role, deletedAt, demoExpiresAt, emailVerified). */
const USER_SELECT = { id: true, email: true, name: true, image: true, createdAt: true } as const;

const SETTINGS_SELECT = {
  timezone: true,
  timezoneConfirmed: true,
  staleFollowUpDays: true,
  staleDaysAfterInterview: true,
  staleGhostDays: true,
  hotkeysEnabled: true,
} as const;

export type OwnedUser = Omit<MeUser, 'createdAt'> & { createdAt: Date };

@Injectable()
export class UsersRepository {
  constructor(@Inject(PRISMA) private readonly prisma: AppPrisma) {}

  findOwnedUser(userId: string, tx?: Tx): Promise<OwnedUser | null> {
    return clientFor(this.prisma, tx).user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
  }

  /**
   * The settings row, created with the DB defaults if missing: `INSERT … ON CONFLICT DO NOTHING RETURNING`, so
   * concurrent first calls never raise a unique violation (create* is not owner-checked by the user-scope guard; the
   * FK pins it). An existing row (nothing inserted) is read back. Null only if the user vanished meanwhile.
   */
  async ensureOwnedSettings(userId: string, tx?: Tx): Promise<UserSettings | null> {
    const db = clientFor(this.prisma, tx);
    const [created] = await db.userSettings.createManyAndReturn({
      data: [{ userId }],
      skipDuplicates: true,
      select: SETTINGS_SELECT,
    });
    return created ?? this.findOwnedSettings(userId, tx);
  }

  findOwnedSettings(userId: string, tx?: Tx): Promise<UserSettings | null> {
    return clientFor(this.prisma, tx).userSettings.findUnique({
      where: { userId },
      select: SETTINGS_SELECT,
    });
  }

  /** Throws Prisma P2025 when the row is missing — call ensureOwnedSettings first (same transaction). */
  updateOwnedSettings(userId: string, data: SettingsUpdate, tx?: Tx): Promise<UserSettings> {
    return clientFor(this.prisma, tx).userSettings.update({
      where: { userId },
      data,
      select: SETTINGS_SELECT,
    });
  }
}
