import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [MeController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
