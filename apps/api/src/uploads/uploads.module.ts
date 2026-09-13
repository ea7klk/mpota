import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { StorageService } from './storage.service';

@Module({ controllers: [UploadsController], providers: [UploadsService, StorageService] })
export class UploadsModule {}
