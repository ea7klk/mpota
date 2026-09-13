import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { users } from '../db/schema';

export type AuthInput = { id: string; email: string; displayName: string; role: string; locale: string };

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService) {}

  private async tokenFor(user: AuthInput) {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-only-secret');
    return new SignJWT(user as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(secret);
  }

  async register(input: { email: string; password: string; displayName: string; callsign?: string; locale?: string }) {
    if (process.env.AUTH_MODE === 'keycloak') throw new BadRequestException('Registration is handled by the configured OIDC provider');
    const email = input.email.trim().toLowerCase();
    const existing = await this.db.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing.length) throw new ConflictException('Email already registered');
    const bootstrap = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const role = bootstrap && email === bootstrap ? 'GLOBAL_ADMIN' : 'MEMBER';
    const [created] = await this.db.db.insert(users).values({
      email,
      passwordHash: await bcrypt.hash(input.password, 12),
      displayName: input.displayName.trim(),
      callsign: input.callsign?.trim().toUpperCase(),
      locale: input.locale ?? 'en',
      role
    }).returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, locale: users.locale });
    return { user: created, accessToken: await this.tokenFor(created) };
  }

  async login(emailInput: string, password: string) {
    if (process.env.AUTH_MODE === 'keycloak') throw new BadRequestException('Login is handled by the configured OIDC provider');
    const email = emailInput.trim().toLowerCase();
    const [user] = await this.db.db.select().from(users).where(eq(users.email, email));
    if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const safe = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, locale: user.locale };
    return { user: safe, accessToken: await this.tokenFor(safe) };
  }
}
