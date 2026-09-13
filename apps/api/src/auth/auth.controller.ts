import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { CurrentUser } from './auth.decorators';
import { Public } from './public.decorator';
import { AuthUser } from './auth.types';

class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(10) password!: string;
  @IsString() @MinLength(2) displayName!: string;
  @IsOptional() @IsString() callsign?: string;
  @IsOptional() @IsIn(['en', 'es', 'fr', 'de']) locale?: string;
}

class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a local MPOTA account' })
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Sign in to a local MPOTA account' })
  login(@Body() dto: LoginDto) { return this.auth.login(dto.email, dto.password); }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user claims' })
  me(@CurrentUser() user: AuthUser) { return user; }
}
