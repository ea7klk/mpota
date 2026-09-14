import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { Public } from '../auth/public.decorator';
import { SystemSettingsService } from './system-settings.service';

class SystemSettingsUpdateDto {
  @ApiPropertyOptional({ type: Array, description: 'Database-backed active and inactive park type definitions' })
  @IsOptional() @IsArray() parkTypes?: unknown[];

  @ApiPropertyOptional({ type: Object, description: 'Locale-keyed translation catalogs or overrides' })
  @IsOptional() @IsObject() translations?: Record<string, unknown>;
}

@ApiTags('system-settings')
@Controller()
export class SystemSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Public()
  @Get('settings/public')
  @ApiOperation({ summary: 'Get public database-backed park types and translation overrides' })
  publicSettings() { return this.settings.publicSettings(); }

  @Get('admin/settings')
  @Roles('GLOBAL_ADMIN', 'SYSTEM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get editable system settings' })
  adminSettings() { return this.settings.adminSettings(); }

  @Patch('admin/settings')
  @Roles('GLOBAL_ADMIN', 'SYSTEM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update park types and translation catalogs in the database' })
  update(@CurrentUser() user: AuthUser, @Body() dto: SystemSettingsUpdateDto) { return this.settings.update(user, dto); }
}
