import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { StorageService } from './storage.service';
import { AwardsModule } from '../awards/awards.module';

@Module({ imports: [AwardsModule], controllers: [UploadsController], providers: [UploadsService, StorageService] })
export class UploadsModule {}
