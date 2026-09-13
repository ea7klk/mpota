import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUrl, Length, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { Public } from '../auth/public.decorator';
import { AuthUser } from '../auth/auth.types';
import { ParksService } from './parks.service';

class ProposalDto {
  @ApiProperty({ example: 'ES', minLength: 2, maxLength: 2, description: 'Uppercase ISO 3166-1 alpha-2 country code' })
  @IsString() @Length(2, 2) countryIso2!: string;
  @ApiProperty({ example: 'EU', minLength: 2, maxLength: 4 })
  @IsString() @Length(2, 4) continentCode!: string;
  @ApiPropertyOptional({ example: 'Comunidad de Madrid' })
  @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional({ example: 'Madrid' })
  @IsOptional() @IsString() locality?: string;
  @ApiProperty({ example: 40.4168, minimum: -90, maximum: 90 })
  @IsLatitude() latitude!: number;
  @ApiProperty({ example: -3.7038, minimum: -180, maximum: 180 })
  @IsLongitude() longitude!: number;
  @ApiPropertyOptional({ example: 'MUNICIPAL_PARK', default: 'MUNICIPAL_PARK' })
  @IsOptional() @IsString() parkType?: string;
  @ApiProperty({ example: 'Parque Municipal del Retiro', minLength: 2, maxLength: 240 })
  @IsString() @MinLength(2) @MaxLength(240) name!: string;
  @ApiPropertyOptional({ example: 'A centrally located municipal park suitable for portable amateur-radio operation.' })
  @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ example: 'https://madrid.es/parques/retiro', format: 'uri' })
  @IsOptional() @IsUrl() sourceUrl?: string;
  @ApiPropertyOptional({ example: 'Public access during park opening hours; check local restrictions.' })
  @IsOptional() @IsString() accessNotes?: string;
  @ApiPropertyOptional({ example: 'https://example.org/photos/retiro.jpg', format: 'uri' })
  @IsOptional() @IsUrl() photoUrl?: string;
}

class DecisionDto {
  @ApiPropertyOptional({ example: 'Municipal ownership verified from the city parks register.' })
  @IsOptional() @IsString() notes?: string;
}

class DuplicateCheckDto {
  @ApiProperty({ example: 40.4168, minimum: -90, maximum: 90 })
  @IsLatitude() latitude!: number;
  @ApiProperty({ example: -3.7038, minimum: -180, maximum: 180 })
  @IsLongitude() longitude!: number;
}

class ReverseGeocodeDto {
  @ApiProperty({ example: 40.4168, minimum: -90, maximum: 90 })
  @IsLatitude() latitude!: number;
  @ApiProperty({ example: -3.7038, minimum: -180, maximum: 180 })
  @IsLongitude() longitude!: number;
}

class ParkAdminQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @ApiPropertyOptional({ example: 'EU', description: 'Partial match' })
  @IsOptional() @IsString() @MaxLength(4) continentCode?: string;
  @ApiPropertyOptional({ example: 'ES', description: 'Partial match' })
  @IsOptional() @IsString() @MaxLength(2) countryIso2?: string;
  @ApiPropertyOptional({ example: 'Andalucía', description: 'Partial match' })
  @IsOptional() @IsString() @MaxLength(160) region?: string;
  @ApiPropertyOptional({ example: 'Madrid', description: 'Partial municipality/locality match' })
  @IsOptional() @IsString() @MaxLength(160) locality?: string;
}

class ParkUpdateDto {
  @ApiPropertyOptional({ example: 'ES', readOnly: true })
  @IsOptional() @IsString() @Length(2, 2) countryIso2?: string;
  @ApiPropertyOptional({ example: 'EU', readOnly: true })
  @IsOptional() @IsString() @Length(2, 4) continentCode?: string;
  @ApiPropertyOptional({ example: 'Comunidad de Madrid' })
  @IsOptional() @IsString() @MaxLength(160) region?: string;
  @ApiPropertyOptional({ example: 'Madrid' })
  @IsOptional() @IsString() @MaxLength(160) locality?: string;
  @ApiPropertyOptional({ example: 40.4168, minimum: -90, maximum: 90 })
  @IsOptional() @IsLatitude() latitude?: number;
  @ApiPropertyOptional({ example: -3.7038, minimum: -180, maximum: 180 })
  @IsOptional() @IsLongitude() longitude?: number;
  @ApiPropertyOptional({ example: 'MUNICIPAL_PARK' })
  @IsOptional() @IsString() @MaxLength(64) parkType?: string;
  @ApiPropertyOptional({ example: 'Parque Municipal del Retiro', minLength: 2, maxLength: 240 })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(240) name?: string;
  @ApiPropertyOptional({ example: 'A centrally located municipal park.' })
  @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ example: 'https://madrid.es/parques/retiro', format: 'uri' })
  @IsOptional() @IsUrl() sourceUrl?: string;
  @ApiPropertyOptional({ example: 'Public access during opening hours.' })
  @IsOptional() @IsString() accessNotes?: string;
  @ApiPropertyOptional({ example: 'https://example.org/photos/retiro.jpg', format: 'uri' })
  @IsOptional() @IsUrl() photoUrl?: string;
}

@ApiTags('parks')
@Controller()
export class ParksController {
  constructor(private readonly parks: ParksService) {}

  @Public()
  @Get('parks')
  @ApiOperation({ summary: 'List approved parks for the public map' })
  list() { return this.parks.approved(); }

  @Public()
  @Get('parks/:reference/images')
  @ApiOperation({ summary: 'List images for one approved park' })
  images(@Param('reference') reference: string) { return this.parks.listImages(reference); }

  @Public()
  @Get('parks/:reference/images/:imageId')
  @ApiOperation({ summary: 'Serve one image for an approved park' })
  async image(@Param('reference') reference: string, @Param('imageId') imageId: string, @Res() response: Response) {
    const image = await this.parks.getImage(reference, imageId);
    response.type(image.contentType).send(image.body);
  }

  @Public()
  @Get('parks/:reference')
  @ApiOperation({ summary: 'Get one approved park by reference' })
  find(@Param('reference') reference: string) { return this.parks.findApproved(reference); }

  @Public()
  @Get('parks/:reference/detail')
  @ApiOperation({ summary: 'Get approved park details, images, activations, and leaders' })
  detail(@Param('reference') reference: string) { return this.parks.detail(reference); }

  @Post('parks/:reference/images')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'JPEG, PNG, WebP, or GIF park image' } } } })
  @ApiOperation({ summary: 'Upload an image for an approved park' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: Number(process.env.PARK_IMAGE_MAX_BYTES ?? 10 * 1024 * 1024) } }))
  uploadImage(@CurrentUser() user: AuthUser, @Param('reference') reference: string, @UploadedFile() file: Express.Multer.File) {
    return this.parks.uploadImage(user, reference, file);
  }

  @Post('proposals')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Propose a municipal park' })
  propose(@CurrentUser() user: AuthUser, @Body() dto: ProposalDto) { return this.parks.createProposal(user, dto); }

  @Post('proposals/duplicate-check')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find approved parks and pending proposals within 150 metres' })
  duplicateCheck(@Body() dto: DuplicateCheckDto) { return this.parks.nearby(dto); }

  @Post('proposals/reverse-geocode')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve country, continent, region, and locality from proposal coordinates' })
  reverseGeocode(@Body() dto: ReverseGeocodeDto) { return this.parks.reverseGeocode(dto); }

  @Get('admin/parks')
  @Roles('ENTITY_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search and paginate parks within the administrator approval scope' })
  adminList(@CurrentUser() user: AuthUser, @Query() query: ParkAdminQueryDto) { return this.parks.adminList(user, query); }

  @Get('admin/parks/:id')
  @Roles('ENTITY_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one park for administration' })
  adminFind(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.parks.adminFind(user, id); }

  @Patch('admin/parks/:id')
  @Roles('ENTITY_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a park, including its map location, within the administrator scope' })
  adminUpdate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ParkUpdateDto) { return this.parks.update(user, id, dto); }

  @Get('proposals/mine')
  @ApiBearerAuth()
  mine(@CurrentUser() user: AuthUser) { return this.parks.mine(user); }

  @Get('proposals/queue')
  @Roles('ENTITY_ADMIN')
  @ApiBearerAuth()
  queue(@CurrentUser() user: AuthUser) { return this.parks.queue(user); }

  @Post('proposals/:id/approve')
  @Roles('ENTITY_ADMIN')
  @ApiBearerAuth()
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.parks.approve(user, id); }

  @Post('proposals/:id/reject')
  @Roles('ENTITY_ADMIN')
  @ApiBearerAuth()
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) { return this.parks.reject(user, id, dto.notes); }

  @Post('parks/:id/remove')
  @Roles('GLOBAL_ADMIN')
  @ApiBearerAuth()
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) { return this.parks.remove(user, id, dto.notes); }
}
