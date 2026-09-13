import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser } from './auth.types';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest().user as AuthUser;
});

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
