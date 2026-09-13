import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthUser } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private readonly keycloakKeys = process.env.KEYCLOAK_JWKS_URL ? createRemoteJWKSet(new URL(process.env.KEYCLOAK_JWKS_URL)) : undefined;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const publicRoute = this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()]);
    if (publicRoute || request.path?.startsWith('/docs')) return true;
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Bearer token required');
    try {
      const keycloak = process.env.AUTH_MODE === 'keycloak';
      const result = keycloak
        ? await jwtVerify(token, this.keycloakKeys!, { issuer: process.env.KEYCLOAK_ISSUER, audience: process.env.KEYCLOAK_AUDIENCE })
        : await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-only-secret'));
      const payload = result.payload as typeof result.payload & { realm_access?: { roles?: string[] }; preferred_username?: string; name?: string; displayName?: string; role?: string; locale?: string };
      const validRoles = ['MEMBER', 'ENTITY_ADMIN', 'AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'];
      const role = (keycloak ? payload.realm_access?.roles?.find((candidate) => validRoles.includes(candidate)) : payload.role && validRoles.includes(payload.role) ? payload.role : undefined) ?? 'MEMBER';
      request.user = { id: payload.sub!, email: String(payload.email ?? payload.preferred_username ?? ''), displayName: String(payload.displayName ?? payload.name ?? payload.preferred_username ?? ''), role, locale: String(payload.locale ?? 'en') } satisfies AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
