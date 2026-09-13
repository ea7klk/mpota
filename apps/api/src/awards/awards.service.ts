import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { auditEvents, awardGrants, awardProgress, awards } from '../db/schema';
import { AuthUser } from '../auth/auth.types';

export type AwardInput = {
  key: string;
  name: string;
  description?: string;
  iconUrl?: string;
  type: 'ACTIVATOR' | 'HUNTER' | 'COMBINED';
  scopeCountries?: string[];
  scopeContinents?: string[];
  allCountries?: boolean;
  ruleDefinition?: Record<string, unknown>;
};

@Injectable()
export class AwardsService {
  constructor(private readonly db: DbService) {}

  list() { return this.db.db.select().from(awards).where(eq(awards.status, 'PUBLISHED')).orderBy(desc(awards.publishedAt)); }

  async create(user: AuthUser, input: AwardInput) {
    const [award] = await this.db.db.insert(awards).values({
      key: input.key.trim().toLowerCase(), name: input.name.trim(), description: input.description, iconUrl: input.iconUrl,
      type: input.type, scopeCountries: (input.scopeCountries ?? []).map((v) => v.toUpperCase()),
      scopeContinents: (input.scopeContinents ?? []).map((v) => v.toUpperCase()), allCountries: input.allCountries ?? false,
      ruleDefinition: input.ruleDefinition ?? {}, createdBy: user.id
    }).returning();
    await this.db.db.insert(auditEvents).values({ actorId: user.id, action: 'AWARD_CREATED', entityType: 'award', entityId: award.id, afterJson: { key: award.key } });
    return award;
  }

  async publish(user: AuthUser, id: string) {
    if (!['GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role)) throw new ForbiddenException('Global admin role required');
    const [award] = await this.db.db.update(awards).set({ status: 'PUBLISHED', publishedBy: user.id, publishedAt: new Date() }).where(and(eq(awards.id, id), eq(awards.status, 'DRAFT'))).returning();
    if (!award) throw new NotFoundException('Draft award not found');
    await this.db.db.insert(auditEvents).values({ actorId: user.id, action: 'AWARD_PUBLISHED', entityType: 'award', entityId: id });
    return award;
  }

  async progress(user: AuthUser) {
    await this.recalculateForUser(user.id);
    const rows = await this.db.db.select().from(awardProgress).where(eq(awardProgress.userId, user.id));
    const grants = await this.db.db.select().from(awardGrants).where(eq(awardGrants.userId, user.id));
    return { progress: rows, grants };
  }

  async recalculateForUser(userId: string) {
    const published = await this.db.db.select().from(awards).where(eq(awards.status, 'PUBLISHED'));
    const contacts = await this.db.db.execute(sql`
      SELECT c.user_id, c.hunter_user_id, c.park_id, p.country_iso2, p.continent_code
      FROM contacts c
      INNER JOIN parks p ON p.id = c.park_id
      WHERE c.validity = 'VALID'
        AND (c.user_id = ${userId} OR c.hunter_user_id = ${userId})
        AND c.park_id IS NOT NULL
    `);
    const rows = contacts.rows as Array<{ user_id: string; hunter_user_id: string | null; park_id: string; country_iso2: string; continent_code: string }>;
    for (const award of published) {
      const rule = (award.ruleDefinition ?? {}) as { minimumEntities?: number };
      const requiredValue = Math.max(1, Number(rule.minimumEntities ?? 1));
      const allowed = (country: string, continent: string) => award.allCountries
        || award.scopeCountries.includes(country)
        || award.scopeContinents.includes(continent)
        || (!award.scopeCountries.length && !award.scopeContinents.length);
      const qualifying = new Set(rows.filter((row) => {
        if (!allowed(row.country_iso2, row.continent_code)) return false;
        if (award.type === 'ACTIVATOR') return row.user_id === userId;
        if (award.type === 'HUNTER') return row.hunter_user_id === userId;
        return row.user_id === userId || row.hunter_user_id === userId;
      }).map((row) => row.park_id));
      const currentValue = qualifying.size;
      const status = currentValue >= requiredValue ? 'EARNED' : 'IN_PROGRESS';
      await this.db.db.insert(awardProgress).values({ userId, awardId: award.id, currentValue, requiredValue, status })
        .onConflictDoUpdate({ target: [awardProgress.userId, awardProgress.awardId], set: { currentValue, requiredValue, status, updatedAt: new Date() } });
      if (status === 'EARNED') {
        await this.db.db.insert(awardGrants).values({ userId, awardId: award.id, awardVersion: award.version, evidenceSnapshot: { qualifyingEntities: currentValue, source: 'automatic-recalculation' } }).onConflictDoNothing();
      }
    }
  }
}
