import { BadRequestException, ConflictException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { contacts, users } from '../db/schema';
import { AwardsService } from '../awards/awards.service';

export type AuthInput = { id: string; email: string; displayName: string; callsign?: string | null; role: string; locale: string };

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly db: DbService, private readonly awards: AwardsService) {}

  async onModuleInit() {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) return;

    const [created] = await this.db.db.insert(users).values({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      displayName: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'MPOTA Administrator',
      callsign: process.env.BOOTSTRAP_ADMIN_CALLSIGN?.trim().toUpperCase() || null,
      locale: process.env.BOOTSTRAP_ADMIN_LOCALE?.trim() || 'en',
      status: 'ACTIVE',
      role: 'GLOBAL_ADMIN'
    }).onConflictDoNothing({ target: users.email }).returning({ id: users.id, email: users.email });

    if (created) console.log(`Bootstrap administrator ready: ${created.email}`);
    else await this.db.db.update(users).set({ role: 'GLOBAL_ADMIN' }).where(eq(users.email, email));
  }

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
    const callsign = input.callsign?.trim().toUpperCase() || null;
    if (callsign) {
      const [matchingUser] = await this.db.db.select({ id: users.id }).from(users).where(sql`upper(${users.callsign}) = ${callsign}`);
      if (matchingUser) throw new ConflictException('Callsign already registered');
    }
    const created = await this.db.db.transaction(async (tx) => {
      const [inserted] = await tx.insert(users).values({
        email,
        passwordHash: await bcrypt.hash(input.password, 12),
        displayName: input.displayName.trim(),
        callsign,
        locale: input.locale ?? 'en',
        role
      }).returning({ id: users.id, email: users.email, displayName: users.displayName, callsign: users.callsign, role: users.role, locale: users.locale });
      if (callsign) await tx.update(contacts).set({ hunterUserId: inserted.id }).where(and(isNull(contacts.hunterUserId), sql`upper(${contacts.qsoCallsign}) = ${callsign}`, eq(contacts.validity, 'VALID')));
      return inserted;
    });
    await this.awards.recalculateForUser(created.id);
    return { user: created, accessToken: await this.tokenFor(created) };
  }

  async login(emailInput: string, password: string) {
    if (process.env.AUTH_MODE === 'keycloak') throw new BadRequestException('Login is handled by the configured OIDC provider');
    const email = emailInput.trim().toLowerCase();
    const [user] = await this.db.db.select().from(users).where(eq(users.email, email));
    if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const safe = { id: user.id, email: user.email, displayName: user.displayName, callsign: user.callsign, role: user.role, locale: user.locale };
    return { user: safe, accessToken: await this.tokenFor(safe) };
  }
}
