import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUrl, Length, MinLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { Public } from '../auth/public.decorator';
import { AuthUser } from '../auth/auth.types';
import { AwardsService } from './awards.service';

class AwardDto {
  @IsString() @MinLength(3) key!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUrl() iconUrl?: string;
  @IsIn(['ACTIVATOR', 'HUNTER', 'COMBINED']) type!: 'ACTIVATOR' | 'HUNTER' | 'COMBINED';
  @IsOptional() @IsArray() @IsString({ each: true }) @Length(2, 2, { each: true }) scopeCountries?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) scopeContinents?: string[];
  @IsOptional() @IsBoolean() allCountries?: boolean;
  @IsOptional() @IsObject() ruleDefinition?: Record<string, unknown>;
}

@ApiTags('awards')
@Controller('awards')
export class AwardsController {
  constructor(private readonly awards: AwardsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published awards' })
  list() { return this.awards.list(); }

  @Post()
  @Roles('AWARD_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an award draft' })
  create(@CurrentUser() user: AuthUser, @Body() dto: AwardDto) { return this.awards.create(user, dto); }

  @Post(':id/publish')
  @Roles('GLOBAL_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish an award draft (global admin)' })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.awards.publish(user, id); }

  @Get('progress/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get award progress and grants for the current user' })
  progress(@CurrentUser() user: AuthUser) { return this.awards.progress(user); }
}
