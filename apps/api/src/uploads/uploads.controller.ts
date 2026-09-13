import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { UploadsService } from './uploads.service';

class ManualQsoDto {
  @ApiProperty({ example: 'EA7KPG', minLength: 3, maxLength: 32 })
  @IsString()
  @Length(3, 32)
  qsoCallsign!: string;

  @ApiProperty({ example: '2026-09-13T12:30:00.000Z', format: 'date-time' })
  @IsDateString()
  qsoDatetime!: string;

  @ApiPropertyOptional({ example: '20m', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  band?: string;

  @ApiPropertyOptional({ example: 'SSB', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  mode?: string;
}

@ApiTags('uploads')
@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('parks/:reference/qsos')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add and validate one QSO for an approved park' })
  addQso(@CurrentUser() user: AuthUser, @Param('reference') reference: string, @Body() body: ManualQsoDto) {
    return this.uploads.addManualQso(user, {
      parkReference: reference,
      qsoCallsign: body.qsoCallsign,
      qsoDatetime: new Date(body.qsoDatetime),
      band: body.band,
      mode: body.mode
    });
  }

  @Post('parks/:reference/uploads/adif')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'ADIF file to validate and process for the selected park' } }
    }
  })
  @ApiOperation({ summary: 'Upload an ADIF log for an approved park' })
  @UseInterceptors(FileInterceptor('file'))
  uploadForPark(@CurrentUser() user: AuthUser, @Param('reference') reference: string, @UploadedFile() file: Express.Multer.File) {
    return this.uploads.upload(user, file, reference);
  }

  @Post('uploads/adif')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'parkReference'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'ADIF file to validate and process' },
        parkReference: { type: 'string', example: 'MPES-00001', description: 'Approved park reference' }
      }
    }
  })
  @ApiOperation({ summary: 'Upload an ADIF log with a required park reference' })
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser() user: AuthUser, @Body('parkReference') parkReference: string, @UploadedFile() file: Express.Multer.File) {
    return this.uploads.upload(user, file, parkReference);
  }

  @Get('uploads')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the current user’s ADIF uploads and processing status' })
  list(@CurrentUser() user: AuthUser) { return this.uploads.list(user); }

  @Get('uploads/:id/rejected-qsos')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List rejected QSOs for one of the current user’s processed ADIF uploads' })
  rejectedQsos(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.uploads.rejectedQsos(user, id); }
}
