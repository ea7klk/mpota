import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { approvalScopes, auditEvents, contacts, users } from '../db/schema';
import { AuthUser } from '../auth/auth.types';
import { AwardsService } from '../awards/awards.service';

export type AccessUpdate = {
  role: 'MEMBER' | 'ENTITY_ADMIN' | 'AWARD_ADMIN' | 'GLOBAL_ADMIN' | 'SYSTEM_BOOTSTRAP_ADMIN';
  countryCodes?: string[];
  continentCodes?: string[];
  allCountries?: boolean;
};

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService, private readonly awards: AwardsService) {}

  async profile(user: AuthUser) {
    const [profile] = await this.db.db.select({ id: users.id, email: users.email, displayName: users.displayName, callsign: users.callsign, locale: users.locale, createdAt: users.createdAt }).from(users).where(eq(users.id, user.id));
    if (!profile) throw new NotFoundException('User profile not found');
    await this.awards.recalculateForUser(user.id);
    const activations = await this.db.db.execute(sql`
      WITH activation_groups AS (
        SELECT c.park_id, COALESCE(c.qso_date_utc, c.qso_datetime::date, u.uploaded_at::date) AS activation_date, COUNT(*)::int AS qso_count
        FROM contacts c INNER JOIN adif_uploads u ON u.id = c.upload_id
        WHERE c.user_id = ${user.id} AND c.validity = 'VALID'
        GROUP BY c.park_id, COALESCE(c.qso_date_utc, c.qso_datetime::date, u.uploaded_at::date)
      )
      SELECT p.reference, p.name, activation_date::text AS date, qso_count AS qsos,
        CASE WHEN qso_count >= 10 THEN 'VALID' ELSE 'FAILED' END AS status
      FROM activation_groups INNER JOIN parks p ON p.id = activation_groups.park_id
      ORDER BY activation_date DESC
    `);
    const hunterSummary = await this.db.db.execute(sql`
      SELECT COUNT(*)::int AS total_qsos, COUNT(DISTINCT c.park_id)::int AS parks,
        COUNT(DISTINCT c.qso_callsign)::int AS unique_hunters
      FROM contacts c WHERE c.hunter_user_id = ${user.id} AND c.validity = 'VALID'
    `);
    const hunterParks = await this.db.db.execute(sql`
      SELECT p.reference, p.name, COUNT(*)::int AS qsos, MAX(COALESCE(c.qso_datetime, u.uploaded_at))::text AS last_contact
      FROM contacts c INNER JOIN parks p ON p.id = c.park_id INNER JOIN adif_uploads u ON u.id = c.upload_id
      WHERE c.hunter_user_id = ${user.id} AND c.validity = 'VALID'
      GROUP BY p.id, p.reference, p.name ORDER BY last_contact DESC
    `);
    const awardProgress = await this.db.db.execute(sql`
      SELECT ap.award_id, ap.current_value, ap.required_value, ap.status, a.key, a.name, a.type
      FROM award_progress ap INNER JOIN awards a ON a.id = ap.award_id
      WHERE ap.user_id = ${user.id} ORDER BY a.name
    `);
    const grants = await this.db.db.execute(sql`
      SELECT ag.award_id, ag.award_version, ag.granted_at, a.key, a.name, a.type
      FROM award_grants ag INNER JOIN awards a ON a.id = ag.award_id
      WHERE ag.user_id = ${user.id} ORDER BY ag.granted_at DESC
    `);
    return { profile, activations: activations.rows, hunter: { summary: hunterSummary.rows[0] ?? { total_qsos: 0, parks: 0, unique_hunters: 0 }, parks: hunterParks.rows }, awards: { progress: awardProgress.rows, grants: grants.rows } };
  }

  async updateProfile(user: AuthUser, input: { displayName?: string; callsign?: string; locale?: string }) {
    const callsign = input.callsign === undefined ? undefined : input.callsign.trim().toUpperCase() || null;
    if (callsign) {
      const [matchingUser] = await this.db.db.select({ id: users.id }).from(users).where(and(sql`upper(${users.callsign}) = ${callsign}`, ne(users.id, user.id)));
      if (matchingUser) throw new ConflictException('Callsign already registered');
    }
    const updated = await this.db.db.transaction(async (tx) => {
      const [result] = await tx.update(users).set({
        displayName: input.displayName?.trim() || undefined,
        callsign: callsign === undefined ? undefined : callsign,
        locale: input.locale || undefined
      }).where(eq(users.id, user.id)).returning({ id: users.id, email: users.email, displayName: users.displayName, callsign: users.callsign, locale: users.locale, role: users.role });
      if (!result) throw new NotFoundException('User profile not found');
      if (callsign) await tx.update(contacts).set({ hunterUserId: result.id }).where(and(isNull(contacts.hunterUserId), sql`upper(${contacts.qsoCallsign}) = ${callsign}`, eq(contacts.validity, 'VALID')));
      return result;
    });
    await this.awards.recalculateForUser(updated.id);
    return updated;
  }

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
