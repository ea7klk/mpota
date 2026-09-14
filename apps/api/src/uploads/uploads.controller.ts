import { Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { AdminActivationQuery, DeleteActivationInput, UploadsService } from './uploads.service';

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

  @ApiPropertyOptional({ example: '14.074', maxLength: 32, description: 'Operating frequency, normally expressed in MHz' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  frequency?: string;

  @ApiPropertyOptional({ example: 'SSB', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  mode?: string;
}

class AdminActivationQueryDto implements AdminActivationQuery {
  @ApiPropertyOptional({ example: '2026-09-13', format: 'date' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ example: 'EA7KLK', description: 'Partial activator callsign or display name' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  activatorCallsign?: string;

  @ApiPropertyOptional({ example: 'MPES-00002', description: 'Partial entity reference' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  parkReference?: string;
}

class DeleteActivationDto implements DeleteActivationInput {
  @ApiProperty({ example: '2026-09-13', format: 'date' })
  @IsDateString()
  date!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  activatorId!: string;

  @ApiProperty({ example: 'MPES-00002' })
  @IsString()
  @Length(10, 10)
  parkReference!: string;
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
      frequency: body.frequency,
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

  @Get('admin/qsos/activations')
  @Roles('GLOBAL_ADMIN', 'SYSTEM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List activation groups for global QSO administration' })
  adminActivations(@Query() query: AdminActivationQueryDto) { return this.uploads.adminActivationList(query); }

  @Delete('admin/qsos/activations')
  @Roles('GLOBAL_ADMIN', 'SYSTEM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all stored QSOs for one activator, entity, and UTC date' })
  deleteActivation(@CurrentUser() user: AuthUser, @Query() query: DeleteActivationDto) { return this.uploads.deleteActivation(query, user); }
}
