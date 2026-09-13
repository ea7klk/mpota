import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { approvalScopes, auditEvents, users } from '../db/schema';
import { AuthUser } from '../auth/auth.types';

export type AccessUpdate = {
  role: 'MEMBER' | 'ENTITY_ADMIN' | 'AWARD_ADMIN' | 'GLOBAL_ADMIN' | 'SYSTEM_BOOTSTRAP_ADMIN';
  countryCodes?: string[];
  continentCodes?: string[];
  allCountries?: boolean;
};

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  async list() {
    const rows = await this.db.db.select({ id: users.id, email: users.email, displayName: users.displayName, callsign: users.callsign, locale: users.locale, status: users.status, role: users.role, createdAt: users.createdAt }).from(users).orderBy(users.email);
    const scopes = await this.db.db.select().from(approvalScopes);
    return rows.map((user) => ({
      ...user,
      approvalScope: scopes.find((scope) => scope.userId === user.id) ?? {
        countryCodes: [],
        continentCodes: [],
        allCountries: false
      }
    }));
  }

  async updateAccess(actor: AuthUser, id: string, input: AccessUpdate) {
    const [updated] = await this.db.db.update(users).set({ role: input.role }).where(eq(users.id, id)).returning({ id: users.id, email: users.email, role: users.role });
    if (!updated) throw new NotFoundException('User not found');
    const [scope] = await this.db.db.select().from(approvalScopes).where(eq(approvalScopes.userId, id));
    const values = { countryCodes: (input.countryCodes ?? []).map((v) => v.toUpperCase()), continentCodes: (input.continentCodes ?? []).map((v) => v.toUpperCase()), allCountries: input.allCountries ?? false };
    if (scope) await this.db.db.update(approvalScopes).set(values).where(eq(approvalScopes.id, scope.id));
    else await this.db.db.insert(approvalScopes).values({ userId: id, ...values });
    await this.db.db.insert(auditEvents).values({ actorId: actor.id, action: 'USER_ACCESS_UPDATED', entityType: 'user', entityId: id, afterJson: input });
    return updated;
  }

  async deactivate(actor: AuthUser, id: string) {
    const [updated] = await this.db.db.update(users).set({ status: 'DEACTIVATED', deactivatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id, email: users.email, status: users.status });
    if (!updated) throw new NotFoundException('User not found');
    await this.db.db.insert(auditEvents).values({ actorId: actor.id, action: 'USER_DEACTIVATED', entityType: 'user', entityId: id });
    return updated;
  }

  async remove(actor: AuthUser, id: string) {
    const [updated] = await this.db.db.update(users).set({ status: 'DELETED', email: `deleted-${id}@invalid.mpota`, displayName: 'Deleted user', callsign: null, passwordHash: await bcrypt.hash(randomUUID(), 8), deletedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id, email: users.email, status: users.status });
    if (!updated) throw new NotFoundException('User not found');
    await this.db.db.insert(auditEvents).values({ actorId: actor.id, action: 'USER_DELETED_ANONYMIZED', entityType: 'user', entityId: id });
    return updated;
  }
}
