import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString, IsUrl, Length, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { Public } from '../auth/public.decorator';
import { AuthUser } from '../auth/auth.types';
import { ParksService } from './parks.service';

class ProposalDto {
  @IsString() @Length(2, 2) countryIso2!: string;
  @IsString() @Length(2, 4) continentCode!: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() locality?: string;
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
  @IsOptional() @IsString() parkType?: string;
  @IsString() @MinLength(2) @MaxLength(240) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUrl() sourceUrl?: string;
  @IsOptional() @IsString() accessNotes?: string;
  @IsOptional() @IsUrl() photoUrl?: string;
}

class DecisionDto { @IsOptional() @IsString() notes?: string; }

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
