import { Module } from '@nestjs/common';
import { ParksController } from './parks.controller';
import { ParksService } from './parks.service';
import { StorageService } from '../uploads/storage.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({ imports: [SystemSettingsModule], controllers: [ParksController], providers: [ParksService, StorageService] })
export class ParksModule {}
