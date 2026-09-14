import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { approvalScopes, auditEvents, countrySequences, moderationDecisions, parkImages, parkProposals, parks } from '../db/schema';
import { AuthUser } from '../auth/auth.types';
import { StorageService } from '../uploads/storage.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

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

const COUNTRY_CONTINENTS: Record<string, string> = {};
for (const [continent, countries] of Object.entries({
  AF: 'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW RE SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW',
  AN: 'AQ BV GS HM TF',
  AS: 'AF AM AZ BH BD BT BN KH CN CX CC GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG LK SY TW TJ TH TL TR TM AE UZ VN YE',
  EU: 'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MF MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA',
  NA: 'AI AG AW BS BB BZ BM CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PM PR KN LC MF VC SX BL TT TC US VI VG',
  OC: 'AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV UM VU WF',
  SA: 'AR BO BR CL CO EC FK GF GY PY PE SR UY VE'
})) {
  for (const country of countries.split(' ')) COUNTRY_CONTINENTS[country] = continent;
}

export type ReverseGeocodeInput = { latitude: number; longitude: number };
export type ParkAdminQuery = { page?: number; pageSize?: number; continentCode?: string; countryIso2?: string; region?: string; locality?: string };
export type ParkViewportQuery = { south: number; north: number; west: number; east: number };
export type ParkUpdateInput = { countryIso2?: string; continentCode?: string; region?: string | null; locality?: string | null; latitude?: number; longitude?: number; parkType?: string; name?: string; description?: string | null; sourceUrl?: string | null; accessNotes?: string | null; photoUrl?: string | null };
type ApprovalPolicy = { allCountries: boolean; countryCodes: string[]; continentCodes: string[] };

export type ParkImage = {
  id: string;
  imageNumber: number;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  url: string;
};

const PARK_IMAGE_BUCKET = process.env.S3_PARK_IMAGES_BUCKET ?? 'mpota-park-images';
const MAX_PARK_IMAGE_BYTES = Number(process.env.PARK_IMAGE_MAX_BYTES ?? 10 * 1024 * 1024);
const PARK_IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

@Injectable()
export class ParksService {
  constructor(private readonly db: DbService, private readonly storage: StorageService, private readonly settings: SystemSettingsService) {}

  async listImages(reference: string) {
    const park = await this.findPublic(reference);
    const images = await this.db.db.select({
      id: parkImages.id, imageNumber: parkImages.imageNumber, originalFilename: parkImages.originalFilename,
      contentType: parkImages.contentType, sizeBytes: parkImages.sizeBytes, createdAt: parkImages.createdAt
    }).from(parkImages).where(eq(parkImages.parkId, park.id)).orderBy(asc(parkImages.imageNumber));
    return { parkReference: park.reference, images: images.map((image) => ({ ...image, url: `/parks/${park.reference}/images/${image.id}` })) };
  }

  async getImage(reference: string, imageId: string) {
    const [image] = await this.db.db.select({
      objectKey: parkImages.objectKey, contentType: parkImages.contentType, parkReference: parks.reference
    }).from(parkImages).innerJoin(parks, eq(parkImages.parkId, parks.id)).where(and(
      eq(parkImages.id, imageId), eq(parks.reference, reference.toUpperCase()), inArray(parks.status, ['APPROVED', 'RETIRED'])
    ));
    if (!image) throw new NotFoundException('Park image not found');
    return this.storage.get(image.objectKey, PARK_IMAGE_BUCKET);
  }

  async detail(reference: string) {
    const park = await this.findPublic(reference);
    const imageResult = await this.listImages(park.reference);
    const activations = await this.db.db.execute(sql`
      SELECT
        COALESCE(c.qso_date_utc, c.qso_datetime::date, u.uploaded_at::date)::text AS date,
        COALESCE(NULLIF(uploader.callsign, ''), uploader.display_name) AS callsign,
        COUNT(*)::int AS total_qsos,
        COUNT(*) FILTER (WHERE upper(COALESCE(c.mode, '')) = 'CW')::int AS cw,
        COUNT(*) FILTER (WHERE upper(COALESCE(c.mode, '')) IN ('SSB', 'AM', 'FM', 'USB', 'LSB', 'PHONE'))::int AS phone,
        COUNT(*) FILTER (WHERE upper(COALESCE(c.mode, '')) NOT IN ('CW', 'SSB', 'AM', 'FM', 'USB', 'LSB', 'PHONE'))::int AS data,
        CASE WHEN COUNT(*) >= 10 THEN 'VALID' ELSE 'FAILED' END AS status
      FROM contacts c
      INNER JOIN adif_uploads u ON u.id = c.upload_id
      INNER JOIN users uploader ON uploader.id = c.user_id
      WHERE c.park_id = ${park.id} AND c.validity = 'VALID'
      GROUP BY c.user_id, 1, 2
      ORDER BY date DESC, total_qsos DESC
      LIMIT 100
    `);
    const summary = await this.db.db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE qso_count >= 10)::int AS activation_count,
        SUM(qso_count)::int AS total_qsos,
        MIN(activation_date) FILTER (WHERE qso_count >= 10)::text AS first_activation
      FROM (
        SELECT c.user_id, COALESCE(c.qso_date_utc, c.qso_datetime::date, u.uploaded_at::date) AS activation_date, COUNT(*)::int AS qso_count
        FROM contacts c
        INNER JOIN adif_uploads u ON u.id = c.upload_id
        WHERE c.park_id = ${park.id} AND c.validity = 'VALID'
        GROUP BY c.user_id, COALESCE(c.qso_date_utc, c.qso_datetime::date, u.uploaded_at::date)
      ) activation_groups
    `);
    const activatorLeaders = await this.db.db.execute(sql`
      WITH qualifying_activations AS (
        SELECT c.user_id, COALESCE(c.qso_date_utc, c.qso_datetime::date, u.uploaded_at::date) AS activation_date
        FROM contacts c
        INNER JOIN adif_uploads u ON u.id = c.upload_id
        WHERE c.park_id = ${park.id} AND c.validity = 'VALID'
        GROUP BY c.user_id, COALESCE(c.qso_date_utc, c.qso_datetime::date, u.uploaded_at::date)
        HAVING COUNT(*) >= 10
      )
      SELECT
        COALESCE(NULLIF(uploader.callsign, ''), uploader.display_name) AS callsign,
        uploader.display_name,
        COUNT(DISTINCT qa.activation_date)::int AS activations,
        COUNT(*)::int AS qsos
      FROM contacts c
      INNER JOIN adif_uploads u ON u.id = c.upload_id
      INNER JOIN users uploader ON uploader.id = c.user_id
      INNER JOIN qualifying_activations qa ON qa.user_id = c.user_id AND qa.activation_date = COALESCE(c.qso_date_utc, c.qso_datetime::date, u.uploaded_at::date)
      WHERE c.park_id = ${park.id} AND c.validity = 'VALID'
      GROUP BY uploader.id, uploader.callsign, uploader.display_name
      ORDER BY activations DESC, qsos DESC, callsign
      LIMIT 10
    `);
    const hunterLeaders = await this.db.db.execute(sql`
      SELECT c.qso_callsign AS callsign, COUNT(*)::int AS qsos
      FROM contacts c
      WHERE c.park_id = ${park.id} AND c.validity = 'VALID'
      GROUP BY c.qso_callsign
      ORDER BY qsos DESC, callsign
      LIMIT 10
    `);
    const activationRows = activations.rows as Array<{ date: string; callsign: string; total_qsos: number }>;
    const [summaryRow] = summary.rows as Array<{ activation_count: number; total_qsos: number; first_activation: string | null }>;
    return {
      ...park,
      images: imageResult.images,
      stats: {
        activationCount: Number(summaryRow?.activation_count ?? 0),
        totalQsos: Number(summaryRow?.total_qsos ?? 0),
        firstActivation: summaryRow?.first_activation ?? null
      },
      activations: activations.rows,
      leaders: { activators: activatorLeaders.rows, hunters: hunterLeaders.rows }
    };
  }

  async uploadImage(user: AuthUser, reference: string, file: Express.Multer.File) {
    const contentType = file?.mimetype ?? '';
    if (!file || !PARK_IMAGE_TYPES[contentType]) throw new BadRequestException('Upload a JPEG, PNG, WebP, or GIF image');
    if (file.size > MAX_PARK_IMAGE_BYTES) throw new BadRequestException(`Park images must be smaller than ${Math.floor(MAX_PARK_IMAGE_BYTES / 1024 / 1024)} MB`);

    const [park] = await this.db.db.select().from(parks).where(and(eq(parks.reference, reference.toUpperCase()), eq(parks.status, 'APPROVED')));
    if (!park) throw new NotFoundException('Approved park not found');

    let objectKey: string | undefined;
    try {
      return await this.db.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM parks WHERE id = ${park.id} FOR UPDATE`);
        const [last] = await tx.select({ imageNumber: sql<number>`coalesce(max(${parkImages.imageNumber}), 0)` }).from(parkImages).where(eq(parkImages.parkId, park.id));
        const imageNumber = Number(last?.imageNumber ?? 0) + 1;
        const extension = PARK_IMAGE_TYPES[contentType];
        objectKey = `${park.continentCode}/${park.countryIso2}/${park.reference}-${String(imageNumber).padStart(3, '0')}.${extension}`;
        await this.storage.put(objectKey, file.buffer, contentType, PARK_IMAGE_BUCKET);
        const [image] = await tx.insert(parkImages).values({
          parkId: park.id, uploadedBy: user.id, imageNumber, objectKey,
          originalFilename: file.originalname, contentType, sizeBytes: file.size
        }).returning({
          id: parkImages.id, imageNumber: parkImages.imageNumber, originalFilename: parkImages.originalFilename,
          contentType: parkImages.contentType, sizeBytes: parkImages.sizeBytes, createdAt: parkImages.createdAt
        });
        await tx.insert(auditEvents).values({ actorId: user.id, action: 'PARK_IMAGE_UPLOADED', entityType: 'park', entityId: park.id, afterJson: { imageId: image.id, objectKey } });
        return { ...image, url: `/parks/${park.reference}/images/${image.id}` };
      });
    } catch (error) {
      if (objectKey) await this.storage.delete(objectKey, PARK_IMAGE_BUCKET).catch(() => undefined);
      throw error;
    }
  }

  async approved() {
    return this.db.db.select({
      id: parks.id, reference: parks.reference, countryIso2: parks.countryIso2,
      continentCode: parks.continentCode, region: parks.region, locality: parks.locality,
      latitude: parks.latitude, longitude: parks.longitude, parkType: parks.parkType,
      name: parks.name, description: parks.description, sourceUrl: parks.sourceUrl,
      accessNotes: parks.accessNotes, photoUrl: parks.photoUrl, status: parks.status
    }).from(parks).where(inArray(parks.status, ['APPROVED', 'RETIRED'])).orderBy(parks.reference).limit(2000);
  }

  async inViewport(query: ParkViewportQuery) {
    const south = Math.min(query.south, query.north);
    const north = Math.max(query.south, query.north);
    const latitudeFilter = and(gte(parks.latitude, String(south)), lte(parks.latitude, String(north)));
    const longitudeFilter = query.west <= query.east
      ? and(gte(parks.longitude, String(query.west)), lte(parks.longitude, String(query.east)))
      : or(gte(parks.longitude, String(query.west)), lte(parks.longitude, String(query.east)));
    return this.db.db.select({
      id: parks.id, reference: parks.reference, countryIso2: parks.countryIso2,
      continentCode: parks.continentCode, region: parks.region, locality: parks.locality,
      latitude: parks.latitude, longitude: parks.longitude, parkType: parks.parkType,
      name: parks.name, description: parks.description, sourceUrl: parks.sourceUrl,
      accessNotes: parks.accessNotes, photoUrl: parks.photoUrl, status: parks.status
    }).from(parks).where(and(latitudeFilter, longitudeFilter, inArray(parks.status, ['APPROVED', 'RETIRED']))).orderBy(parks.reference).limit(2000);
  }

  async adminList(user: AuthUser, query: ParkAdminQuery) {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 20)));
    const filters = [];
    if (query.continentCode?.trim()) filters.push(ilike(parks.continentCode, `%${query.continentCode.trim()}%`));
    if (query.countryIso2?.trim()) filters.push(ilike(parks.countryIso2, `%${query.countryIso2.trim()}%`));
    if (query.region?.trim()) filters.push(ilike(parks.region, `%${query.region.trim()}%`));
    if (query.locality?.trim()) filters.push(ilike(parks.locality, `%${query.locality.trim()}%`));

    if (user.role !== 'GLOBAL_ADMIN' && user.role !== 'SYSTEM_BOOTSTRAP_ADMIN') {
      const scope = await this.approvalPolicy(user);
      if (!scope.allCountries) {
        const scopeFilters = [];
        if (scope.countryCodes.length) scopeFilters.push(inArray(parks.countryIso2, scope.countryCodes));
        if (scope.continentCodes.length) scopeFilters.push(inArray(parks.continentCode, scope.continentCodes));
        if (!scopeFilters.length) return { items: [], page, pageSize, total: 0, totalPages: 0 };
        filters.push(or(...scopeFilters)!);
      }
    }

    const where = filters.length ? and(...filters) : undefined;
    const [{ total }] = await this.db.db.select({ total: count() }).from(parks).where(where);
    const items = await this.db.db.select().from(parks).where(where).orderBy(parks.reference).limit(pageSize).offset((page - 1) * pageSize);
    const totalCount = Number(total);
    return { items, page, pageSize, total: totalCount, totalPages: Math.ceil(totalCount / pageSize) };
  }

  async adminFind(user: AuthUser, id: string) {
    const [park] = await this.db.db.select().from(parks).where(eq(parks.id, id));
    if (!park) throw new NotFoundException('Park not found');
    await this.assertScope(user, park.countryIso2, park.continentCode);
    return park;
  }

  async update(user: AuthUser, id: string, input: ParkUpdateInput) {
    const existing = await this.adminFind(user, id);
    const countryIso2 = input.countryIso2?.trim().toUpperCase();
    const continentCode = input.continentCode?.trim().toUpperCase();
    if (countryIso2 && countryIso2 !== existing.countryIso2) throw new BadRequestException('Country code cannot be changed because it is part of the park reference');
    if (continentCode && continentCode !== existing.continentCode) throw new BadRequestException('Continent code cannot be changed independently of the park reference');
    const latitude = input.latitude ?? Number(existing.latitude);
    const longitude = input.longitude ?? Number(existing.longitude);
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new BadRequestException('Coordinates are out of range');
    const parkType = input.parkType === undefined ? undefined : await this.settings.assertParkType(input.parkType);
    const [updated] = await this.db.db.update(parks).set({
      region: input.region === undefined ? undefined : input.region || null, locality: input.locality === undefined ? undefined : input.locality || null, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6),
      geom: { x: longitude, y: latitude }, parkType, name: input.name?.trim(), description: input.description === undefined ? undefined : input.description || null,
      sourceUrl: input.sourceUrl === undefined ? undefined : input.sourceUrl || null, accessNotes: input.accessNotes === undefined ? undefined : input.accessNotes || null, photoUrl: input.photoUrl === undefined ? undefined : input.photoUrl || null, updatedAt: new Date()
    }).where(eq(parks.id, id)).returning();
    await this.db.db.insert(auditEvents).values({ actorId: user.id, action: 'ENTITY_UPDATED', entityType: 'park', entityId: id, beforeJson: { reference: existing.reference, latitude: existing.latitude, longitude: existing.longitude, name: existing.name }, afterJson: { reference: updated.reference, latitude: updated.latitude, longitude: updated.longitude, name: updated.name } });
    return updated;
  }

  async findPublic(reference: string) {
    const [park] = await this.db.db.select().from(parks).where(and(eq(parks.reference, reference.toUpperCase()), inArray(parks.status, ['APPROVED', 'RETIRED'])));
    if (!park) throw new NotFoundException('Park not found');
    return park;
  }

  async createProposal(user: AuthUser, input: ProposalInput) {
    const countryIso2 = input.countryIso2.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryIso2)) throw new BadRequestException('countryIso2 must be ISO-3166 alpha-2');
    if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
      throw new BadRequestException('Coordinates are out of range');
    }
    const parkType = await this.settings.assertParkType(input.parkType);
    const [proposal] = await this.db.db.insert(parkProposals).values({
      submittedBy: user.id, countryIso2, continentCode: input.continentCode.trim().toUpperCase(),
      region: input.region, locality: input.locality, latitude: input.latitude.toFixed(6), longitude: input.longitude.toFixed(6),
      parkType, name: input.name.trim(), description: input.description,
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

  async reverseGeocode(input: ReverseGeocodeInput) {
    if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
      throw new BadRequestException('Coordinates are out of range');
    }
    const empty = { countryName: '', countryIso2: '', continentCode: '', region: '', locality: '' };
    try {
      const endpoint = new URL(process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/reverse');
      endpoint.search = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', zoom: '18', lat: String(input.latitude), lon: String(input.longitude) }).toString();
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': process.env.GEOCODER_USER_AGENT ?? 'MPOTA/0.1 (reverse geocoding; configure GEOCODER_USER_AGENT)'
        },
        signal: AbortSignal.timeout(6000)
      });
      if (!response.ok) return empty;
      const result = await response.json() as { address?: Record<string, string> };
      const address = result.address ?? {};
      const countryIso2 = String(address.country_code ?? '').toUpperCase();
      const addressContinent = String(address.continent_code ?? address.continent ?? '').toUpperCase();
      const continentCode = ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'].includes(addressContinent)
        ? addressContinent
        : COUNTRY_CONTINENTS[countryIso2] ?? '';
      return {
        countryName: address.country ?? '', countryIso2, continentCode,
        region: address.state ?? address.region ?? address.county ?? '',
        locality: address.city ?? address.town ?? address.village ?? address.municipality ?? address.hamlet ?? address.suburb ?? ''
      };
    } catch {
      return empty;
    }
  }

  async mine(user: AuthUser) {
    return this.db.db.select().from(parkProposals).where(eq(parkProposals.submittedBy, user.id)).orderBy(desc(parkProposals.createdAt));
  }

  async queue(user: AuthUser) {
    const rows = await this.db.db.select().from(parkProposals).where(eq(parkProposals.status, 'PENDING')).orderBy(desc(parkProposals.createdAt));
    if (user.role === 'GLOBAL_ADMIN' || user.role === 'SYSTEM_BOOTSTRAP_ADMIN') return rows;
    const scope = await this.approvalPolicy(user);
    return rows.filter((row) => this.inApprovalScope(scope, row.countryIso2, row.continentCode));
  }

  async approve(user: AuthUser, proposalId: string) {
    return this.db.db.transaction(async (tx) => {
      const [proposal] = await tx.select().from(parkProposals).where(eq(parkProposals.id, proposalId));
      if (!proposal || proposal.status !== 'PENDING') throw new NotFoundException('Pending proposal not found');
      await this.assertScope(user, proposal.countryIso2, proposal.continentCode, tx);
      await this.settings.assertParkType(proposal.parkType);
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

  async retire(user: AuthUser, id: string, reason?: string) {
    const existing = await this.adminFind(user, id);
    if (existing.status === 'RETIRED') return existing;
    const [park] = await this.db.db.update(parks).set({ status: 'RETIRED', removedBy: user.id, removedAt: new Date(), removalReason: reason, updatedAt: new Date() }).where(eq(parks.id, id)).returning();
    if (!park) throw new NotFoundException('Park not found');
    await this.db.db.insert(auditEvents).values({ actorId: user.id, action: 'ENTITY_RETIRED', entityType: 'park', entityId: id, afterJson: { reason } });
    return park;
  }

  async activate(user: AuthUser, id: string) {
    const existing = await this.adminFind(user, id);
    if (!['RETIRED', 'ARCHIVED'].includes(existing.status)) return existing;
    const [park] = await this.db.db.update(parks).set({ status: 'APPROVED', approvedBy: user.id, approvedAt: new Date(), removedBy: null, removedAt: null, removalReason: null, updatedAt: new Date() }).where(eq(parks.id, id)).returning();
    if (!park) throw new NotFoundException('Park not found');
    await this.db.db.insert(auditEvents).values({ actorId: user.id, action: 'ENTITY_ACTIVATED', entityType: 'park', entityId: id });
    return park;
  }

  private async assertScope(user: AuthUser, country: string, continent: string, tx: any = this.db.db) {
    if (user.role === 'GLOBAL_ADMIN' || user.role === 'SYSTEM_BOOTSTRAP_ADMIN') return;
    if (user.role !== 'ENTITY_ADMIN') throw new ForbiddenException('Entity admin role required');
    const scope = await this.approvalPolicy(user, tx);
    if (!this.inApprovalScope(scope, country, continent)) throw new ForbiddenException('Park is outside your approval scope');
  }

  private async approvalPolicy(user: AuthUser, tx: any = this.db.db): Promise<ApprovalPolicy> {
    const scopes = await tx.select().from(approvalScopes).where(eq(approvalScopes.userId, user.id));
    const countryCodes: string[] = scopes.flatMap((scope: any) => (scope.countryCodes ?? []) as string[]);
    const continentCodes: string[] = scopes.flatMap((scope: any) => (scope.continentCodes ?? []) as string[]);
    return {
      allCountries: scopes.some((scope: any) => scope.allCountries),
      countryCodes: Array.from(new Set(countryCodes.map((code) => code.toUpperCase()))),
      continentCodes: Array.from(new Set(continentCodes.map((code) => code.toUpperCase())))
    };
  }

  private inApprovalScope(scope: ApprovalPolicy, country: string, continent: string) {
    return scope.allCountries || scope.countryCodes.includes(country.toUpperCase()) || scope.continentCodes.includes(continent.toUpperCase());
  }
}
