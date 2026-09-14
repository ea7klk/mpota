import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';

class AccessDto {
  @ApiProperty({ enum: ['MEMBER', 'ENTITY_ADMIN', 'AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'], example: 'ENTITY_ADMIN' })
  @IsIn(['MEMBER', 'ENTITY_ADMIN', 'AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN']) role!: 'MEMBER' | 'ENTITY_ADMIN' | 'AWARD_ADMIN' | 'GLOBAL_ADMIN' | 'SYSTEM_ADMIN' | 'SYSTEM_BOOTSTRAP_ADMIN';
  @ApiPropertyOptional({ type: [String], example: ['ES', 'FR'], description: 'Multiple ISO 3166-1 alpha-2 country selections' })
  @IsOptional() @IsArray() @IsString({ each: true }) @Length(2, 2, { each: true }) countryCodes?: string[];
  @ApiPropertyOptional({ type: [String], example: ['EU'], description: 'Multiple continent selections' })
  @IsOptional() @IsArray() @IsString({ each: true }) continentCodes?: string[];
  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional() @IsBoolean() allCountries?: boolean;
}

@ApiTags('admin/users')
@Controller('admin/users')
@Roles('GLOBAL_ADMIN', 'SYSTEM_ADMIN')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (global admin)' })
  list() { return this.users.list(); }

  @Patch(':id/access')
  @ApiOperation({ summary: 'Update a user role and approval multi-select scope' })
  updateAccess(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: AccessDto) { return this.users.updateAccess(actor, id, dto); }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a user' })
  deactivate(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.users.deactivate(actor, id); }

  @Delete(':id')
  @ApiOperation({ summary: 'Anonymize and delete a user' })
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.users.remove(actor, id); }
}
