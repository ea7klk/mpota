import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
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
    const rows = await this.db.db.select().from(awardProgress).where(eq(awardProgress.userId, user.id));
    const grants = await this.db.db.select().from(awardGrants).where(eq(awardGrants.userId, user.id));
    return { progress: rows, grants };
  }
}
