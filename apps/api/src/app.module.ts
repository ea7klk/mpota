import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { ParksModule } from './parks/parks.module';
import { AwardsModule } from './awards/awards.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({ imports: [DbModule, EventsModule, AuthModule, ParksModule, AwardsModule, UploadsModule, UsersModule], controllers: [AppController] })
export class AppModule {}
