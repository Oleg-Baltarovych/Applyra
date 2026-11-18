import { Me, UpdateUserSettings, UserSettings } from '@applyra/contracts';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { IdorExempt } from '../../platform/http/index.js';
import { Session, type UserSession } from '../auth/index.js';
import { UsersService } from './users.service.js';

class UpdateUserSettingsDto extends createZodDto(UpdateUserSettings) {}

/** The signed-in user's own profile + settings (06 §7.1). The user id comes only from the session. */
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @IdorExempt('self-scoped: user from the session, no id input')
  @Get()
  @ZodSerializerDto(Me)
  getMe(@Session() session: UserSession): Promise<Me> {
    return this.users.getMe(session.user.id);
  }

  @IdorExempt("self-scoped: writes only the session user's settings row; strict body has no id")
  @Patch('settings')
  @ZodSerializerDto(UserSettings)
  updateSettings(
    @Session() session: UserSession,
    @Body() body: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    return this.users.updateSettings(session.user.id, body);
  }
}
