import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString, IsUrl, Length, MaxLength, MinLength } from 'class-validator';
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

@ApiTags('parks')
@Controller()
export class ParksController {
  constructor(private readonly parks: ParksService) {}

  @Public()
  @Get('parks')
  @ApiOperation({ summary: 'List approved parks for the public map' })
  list() { return this.parks.approved(); }

  @Public()
  @Get('parks/:reference')
  @ApiOperation({ summary: 'Get one approved park by reference' })
  find(@Param('reference') reference: string) { return this.parks.findApproved(reference); }

  @Post('proposals')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Propose a municipal park' })
  propose(@CurrentUser() user: AuthUser, @Body() dto: ProposalDto) { return this.parks.createProposal(user, dto); }

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
