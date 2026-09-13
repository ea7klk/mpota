import { Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('adif')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and process an ADIF log' })
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) { return this.uploads.upload(user, file); }

  @Get()
  @ApiBearerAuth()
  list(@CurrentUser() user: AuthUser) { return this.uploads.list(user); }
}
