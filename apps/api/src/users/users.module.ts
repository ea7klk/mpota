import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ProfileController } from './profile.controller';
import { AwardsModule } from '../awards/awards.module';

@Module({ imports: [AwardsModule], controllers: [UsersController, ProfileController], providers: [UsersService] })
export class UsersModule {}
