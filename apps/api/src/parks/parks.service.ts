import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { approvalScopes, auditEvents, countrySequences, moderationDecisions, parkProposals, parks } from '../db/schema';
import { AuthUser } from '../auth/auth.types';

export type ProposalInput = {
  countryIso2: string;
  continentCode: string;
  region?: string;
  locality?: string;
  latitude: number;
  longitude: number;
  parkType?: string;
  name: string;
  description?: string;
  sourceUrl?: string;
  accessNotes?: string;
  photoUrl?: string;
};

@Injectable()
export class ParksService {
  constructor(private readonly db: DbService) {}

  async approved() {
    return this.db.db.select({
      id: parks.id, reference: parks.reference, countryIso2: parks.countryIso2,
      continentCode: parks.continentCode, region: parks.region, locality: parks.locality,
      latitude: parks.latitude, longitude: parks.longitude, parkType: parks.parkType,
      name: parks.name, description: parks.description, sourceUrl: parks.sourceUrl,
      accessNotes: parks.accessNotes, photoUrl: parks.photoUrl
    }).from(parks).where(eq(parks.status, 'APPROVED')).orderBy(parks.reference).limit(2000);
  }

  async findApproved(reference: string) {
    const [park] = await this.db.db.select().from(parks).where(and(eq(parks.reference, reference.toUpperCase()), eq(parks.status, 'APPROVED')));
    if (!park) throw new NotFoundException('Approved park not found');
    return park;
  }

  async createProposal(user: AuthUser, input: ProposalInput) {
    const countryIso2 = input.countryIso2.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryIso2)) throw new BadRequestException('countryIso2 must be ISO-3166 alpha-2');
    if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
      throw new BadRequestException('Coordinates are out of range');
    }
    const [proposal] = await this.db.db.insert(parkProposals).values({
      submittedBy: user.id, countryIso2, continentCode: input.continentCode.trim().toUpperCase(),
      region: input.region, locality: input.locality, latitude: input.latitude.toFixed(6), longitude: input.longitude.toFixed(6),
      parkType: input.parkType ?? 'MUNICIPAL_PARK', name: input.name.trim(), description: input.description,
      sourceUrl: input.sourceUrl, accessNotes: input.accessNotes, photoUrl: input.photoUrl
    }).returning();
    return proposal;
  }

  async nearby(input: { latitude: number; longitude: number }) {
    if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
      throw new BadRequestException('Coordinates are out of range');
    }
    const rows = await this.db.db.execute(sql`
      WITH candidates AS (
        SELECT 'APPROVED_PARK'::text AS kind, p.id, p.reference, p.name,
          ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography) AS distance_meters
        FROM parks p
        WHERE p.status = 'APPROVED'
          AND ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography, 150)
        UNION ALL
        SELECT 'PENDING_PROPOSAL'::text AS kind, pp.id, NULL::text AS reference, pp.name,
          ST_Distance(ST_SetSRID(ST_MakePoint(pp.longitude::double precision, pp.latitude::double precision), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography) AS distance_meters
        FROM park_proposals pp
        WHERE pp.status IN ('PENDING', 'CHANGES_REQUESTED')
          AND ST_DWithin(ST_SetSRID(ST_MakePoint(pp.longitude::double precision, pp.latitude::double precision), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography, 150)
      )
      SELECT kind, id, reference, name, ROUND(distance_meters::numeric, 1) AS distance_meters
      FROM candidates
      WHERE distance_meters < 150
      ORDER BY distance_meters
    `);
    return { duplicates: rows.rows };
  }

  async mine(user: AuthUser) {
    return this.db.db.select().from(parkProposals).where(eq(parkProposals.submittedBy, user.id)).orderBy(desc(parkProposals.createdAt));
  }

  async queue(user: AuthUser) {
    const rows = await this.db.db.select().from(parkProposals).where(eq(parkProposals.status, 'PENDING')).orderBy(desc(parkProposals.createdAt));
    if (user.role === 'GLOBAL_ADMIN' || user.role === 'SYSTEM_BOOTSTRAP_ADMIN') return rows;
    const [scope] = await this.db.db.select().from(approvalScopes).where(eq(approvalScopes.userId, user.id));
    if (!scope) return [];
    return rows.filter((row) => scope.allCountries || scope.countryCodes.includes(row.countryIso2) || scope.continentCodes.includes(row.continentCode));
  }

  async approve(user: AuthUser, proposalId: string) {
    return this.db.db.transaction(async (tx) => {
      const [proposal] = await tx.select().from(parkProposals).where(eq(parkProposals.id, proposalId));
      if (!proposal || proposal.status !== 'PENDING') throw new NotFoundException('Pending proposal not found');
      await this.assertScope(user, proposal.countryIso2, proposal.continentCode, tx);
      await tx.execute(sql`
        INSERT INTO country_sequences (country_iso2, next_value)
        VALUES (
          ${proposal.countryIso2},
          COALESCE((
            SELECT MAX(CAST(SUBSTRING(reference FROM '[0-9]{5}$') AS integer)) + 1
            FROM parks
            WHERE country_iso2 = ${proposal.countryIso2}
              AND reference ~ ${`^MP${proposal.countryIso2}-[0-9]{5}$`}
          ), 1)
        )
        ON CONFLICT (country_iso2) DO UPDATE
          SET next_value = GREATEST(country_sequences.next_value, EXCLUDED.next_value)
      `);
      const sequenceResult = await tx.execute(sql`SELECT next_value FROM country_sequences WHERE country_iso2 = ${proposal.countryIso2} FOR UPDATE`);
      const nextValue = Number((sequenceResult.rows[0] as { next_value: number }).next_value);
      const reference = `MP${proposal.countryIso2}-${String(nextValue).padStart(5, '0')}`;
      await tx.update(countrySequences).set({ nextValue: nextValue + 1 }).where(eq(countrySequences.countryIso2, proposal.countryIso2));
      const [park] = await tx.insert(parks).values({
        reference, countryIso2: proposal.countryIso2, continentCode: proposal.continentCode, region: proposal.region,
        locality: proposal.locality, latitude: proposal.latitude, longitude: proposal.longitude, geom: { x: Number(proposal.longitude), y: Number(proposal.latitude) }, parkType: proposal.parkType,
        name: proposal.name, description: proposal.description, sourceUrl: proposal.sourceUrl, accessNotes: proposal.accessNotes,
        photoUrl: proposal.photoUrl, status: 'APPROVED', createdBy: proposal.submittedBy, approvedBy: user.id, approvedAt: new Date()
      }).returning();
      await tx.update(parkProposals).set({ status: 'APPROVED', reviewedBy: user.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(parkProposals.id, proposalId));
      await tx.insert(moderationDecisions).values({ proposalId, decidedBy: user.id, decision: 'APPROVED' });
      await tx.insert(auditEvents).values({ actorId: user.id, action: 'ENTITY_APPROVED', entityType: 'park', entityId: park.id, afterJson: { reference } });
      return park;
    });
  }

  async reject(user: AuthUser, proposalId: string, notes?: string) {
    const [proposal] = await this.db.db.select().from(parkProposals).where(eq(parkProposals.id, proposalId));
    if (!proposal || proposal.status !== 'PENDING') throw new NotFoundException('Pending proposal not found');
    await this.assertScope(user, proposal.countryIso2, proposal.continentCode);
    const [updated] = await this.db.db.update(parkProposals).set({ status: 'REJECTED', reviewNotes: notes, reviewedBy: user.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(parkProposals.id, proposalId)).returning();
    await this.db.db.insert(moderationDecisions).values({ proposalId, decidedBy: user.id, decision: 'REJECTED', notes });
    await this.db.db.insert(auditEvents).values({ actorId: user.id, action: 'ENTITY_REJECTED', entityType: 'proposal', entityId: proposalId, afterJson: { notes } });
    return updated;
  }

  async remove(user: AuthUser, id: string, reason?: string) {
    const [park] = await this.db.db.update(parks).set({ status: 'REMOVED', removedBy: user.id, removedAt: new Date(), removalReason: reason, updatedAt: new Date() }).where(eq(parks.id, id)).returning();
    if (!park) throw new NotFoundException('Park not found');
    await this.db.db.insert(auditEvents).values({ actorId: user.id, action: 'ENTITY_REMOVED', entityType: 'park', entityId: id, afterJson: { reason } });
    return park;
  }

  private async assertScope(user: AuthUser, country: string, continent: string, tx: any = this.db.db) {
    if (user.role === 'GLOBAL_ADMIN' || user.role === 'SYSTEM_BOOTSTRAP_ADMIN') return;
    if (user.role !== 'ENTITY_ADMIN') throw new ForbiddenException('Entity admin role required');
    const [scope] = await tx.select().from(approvalScopes).where(eq(approvalScopes.userId, user.id));
    if (!scope || (!scope.allCountries && !scope.countryCodes.includes(country) && !scope.continentCodes.includes(continent))) throw new ForbiddenException('Proposal is outside your approval scope');
  }
}
