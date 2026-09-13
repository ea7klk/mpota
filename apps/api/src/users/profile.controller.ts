import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';

class ProfileUpdateDto {
  @ApiPropertyOptional({ example: 'Volker Kerkhoff', minLength: 2, maxLength: 160 })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) displayName?: string;
  @ApiPropertyOptional({ example: 'EA7KLK', maxLength: 32 })
  @IsOptional() @IsString() @MaxLength(32) callsign?: string;
  @ApiPropertyOptional({ enum: ['en', 'es', 'fr', 'de'] })
  @IsOptional() @IsIn(['en', 'es', 'fr', 'de']) locale?: string;
}

@ApiTags('profile')
@Controller('profile')
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user profile, activations, hunter summary, and awards' })
  get(@CurrentUser() user: AuthUser) { return this.users.profile(user); }

  @Patch()
  @ApiOperation({ summary: 'Update the profile and claim matching unattributed hunter QSOs' })
  update(@CurrentUser() user: AuthUser, @Body() dto: ProfileUpdateDto) { return this.users.updateProfile(user, dto); }
}
