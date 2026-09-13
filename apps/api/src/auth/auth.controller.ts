import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { CurrentUser } from './auth.decorators';
import { Public } from './public.decorator';
import { AuthUser } from './auth.types';

class RegisterDto {
  @ApiProperty({ example: 'operator@example.org', format: 'email' })
  @IsEmail() email!: string;
  @ApiProperty({ example: 'correct-horse-battery-staple', minLength: 8 })
  @IsString() @MinLength(8) password!: string;
  @ApiProperty({ example: 'Jane Operator', minLength: 2 })
  @IsString() @MinLength(2) displayName!: string;
  @ApiPropertyOptional({ example: 'EA7KLK' })
  @IsOptional() @IsString() callsign?: string;
  @ApiPropertyOptional({ enum: ['en', 'es', 'fr', 'de'], example: 'en', default: 'en' })
  @IsOptional() @IsIn(['en', 'es', 'fr', 'de']) locale?: string;
}

class LoginDto {
  @ApiProperty({ example: 'operator@example.org', format: 'email' })
  @IsEmail() email!: string;
  @ApiProperty({ example: 'correct-horse-battery-staple' })
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
