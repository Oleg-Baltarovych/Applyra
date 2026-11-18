import type { Me, UpdateUserSettings, UserSettings } from '@applyra/contracts';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../platform/http/index.js';
import { TransactionRunner, type Tx } from '../../platform/prisma/transaction.js';
import { toSettingsUpdate } from './settings.domain.js';
import { UsersRepository } from './users.repository.js';

/** Owner of User + UserSettings (04 §3). The settings row is created lazily on first access (M0-11 Q3). */
@Injectable()
export class UsersService {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly users: UsersRepository,
  ) {}

  /** The session user + settings (GET /me). A missing user (deleted mid-session) → 404, not 500. */
  getMe(userId: string): Promise<Me> {
    return this.tx.run(async (tx) => {
      const user = await this.users.findOwnedUser(userId, tx);
      if (user === null) throw new AppException('NOT_FOUND', 'Not found');
      const settings = await this.ensureSettings(userId, tx);
      return { user: { ...user, createdAt: user.createdAt.toISOString() }, settings };
    });
  }

  /** PATCH /me/settings: changes only the passed fields; a `timezone` marks it confirmed. */
  updateSettings(userId: string, patch: UpdateUserSettings): Promise<UserSettings> {
    return this.tx.run(async (tx) => {
      await this.assertUser(userId, tx);
      await this.users.ensureOwnedSettings(userId, tx);
      return this.users.updateOwnedSettings(userId, toSettingsUpdate(patch), tx);
    });
  }

  private async assertUser(userId: string, tx: Tx): Promise<void> {
    if ((await this.users.findOwnedUser(userId, tx)) === null) {
      throw new AppException('NOT_FOUND', 'Not found');
    }
  }

  private async ensureSettings(userId: string, tx: Tx): Promise<UserSettings> {
    const settings = await this.users.ensureOwnedSettings(userId, tx);
    // Null only when the user is deleted concurrently (FK cascade).
    if (settings === null) throw new AppException('NOT_FOUND', 'Not found');
    return settings;
  }
}
