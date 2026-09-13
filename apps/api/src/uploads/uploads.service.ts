import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { adifUploads, auditEvents, contacts, parks, users } from '../db/schema';
import { AuthUser } from '../auth/auth.types';
import { EventsService } from '../events/events.service';
import { StorageService } from './storage.service';
import { AwardsService } from '../awards/awards.service';

type AdifRecord = Record<string, string>;
type QsoInput = { parkReference: string; qsoCallsign: string; qsoDatetime: Date; frequency?: string; band?: string; mode?: string };
type QsoResult = { accepted: boolean; contactId: string; validity: string; errorMessage?: string };
export type AdminActivationQuery = { date?: string; activatorCallsign?: string; parkReference?: string };
export type DeleteActivationInput = { date: string; activatorId: string; parkReference: string };

function parseAdif(text: string): AdifRecord[] {
  return text.split(/<eor\s*>/i).map((chunk) => {
    const record: AdifRecord = {};
    const tags = [...chunk.matchAll(/<([a-z0-9_]+):(\d+)(?::[^>]*)?>/gi)];
    for (let i = 0; i < tags.length; i += 1) {
      const tag = tags[i];
      const start = (tag.index ?? 0) + tag[0].length;
      const end = i + 1 < tags.length ? (tags[i + 1].index ?? text.length) : chunk.length;
      record[tag[1].toUpperCase()] = chunk.slice(start, end).slice(0, Number(tag[2])).trim();
    }
    return record;
  }).filter((record) => record.CALL);
}

function normalizeCallsign(value: string) {
  return value.trim().toUpperCase();
}

function utcDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505');
}

@Injectable()
export class UploadsService {
  constructor(private readonly db: DbService, private readonly storage: StorageService, private readonly events: EventsService, private readonly awards: AwardsService) {}

  async upload(user: AuthUser, file: Express.Multer.File, parkReference: string) {
    if (!file || !/\.(adi|adif)$/i.test(file.originalname)) throw new BadRequestException('Upload an .adi or .adif file');
    const park = await this.approvedPark(parkReference);
    const key = `${user.id}/${Date.now()}-${file.originalname.replace(/[^a-z0-9._-]/gi, '_')}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(key, file.buffer, file.mimetype || 'application/octet-stream');
    try {
      const [upload] = await this.db.db.insert(adifUploads).values({
        uploadedBy: user.id, parkId: park.id, source: 'ADIF', objectKey: key,
        originalFilename: file.originalname, sha256, sizeBytes: file.size, status: 'RECEIVED'
      }).returning();
      void this.processAdif(upload.id, user, park, file.buffer);
      return this.publicUpload(upload, park);
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
  }

  async addManualQso(user: AuthUser, input: QsoInput) {
    const park = await this.approvedPark(input.parkReference);
    const qsoDatetime = new Date(input.qsoDatetime);
    if (Number.isNaN(qsoDatetime.getTime())) throw new BadRequestException('qsoDatetime must be a valid ISO date');
    const [upload] = await this.db.db.insert(adifUploads).values({
      uploadedBy: user.id, parkId: park.id, source: 'MANUAL', objectKey: `manual/${user.id}/${randomUUID()}.qso`,
      originalFilename: 'Manual QSO', sha256: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      sizeBytes: 0, status: 'PROCESSING'
    }).returning();
    const result = await this.storeQso(upload.id, user, { ...input, parkReference: park.reference, qsoDatetime });
    await this.finishUpload(upload.id, 1, result.accepted ? 1 : 0, result.accepted ? 0 : 1);
    await this.awards.recalculateForUser(user.id);
    if (result.accepted) await this.recalculateAttributedHunters(upload.id);
    return { ...result, uploadId: upload.id, parkReference: park.reference };
  }

  async list(user: AuthUser) {
    const rows = await this.db.db.select({
      id: adifUploads.id, originalFilename: adifUploads.originalFilename, source: adifUploads.source,
      status: adifUploads.status, sizeBytes: adifUploads.sizeBytes, contactCount: adifUploads.contactCount,
      validCount: adifUploads.validCount, errorCount: adifUploads.errorCount, uploadedAt: adifUploads.uploadedAt,
      processedAt: adifUploads.processedAt, parkReference: parks.reference, parkName: parks.name
    }).from(adifUploads).leftJoin(parks, eq(adifUploads.parkId, parks.id)).where(and(
      eq(adifUploads.uploadedBy, user.id), eq(adifUploads.source, 'ADIF')
    )).orderBy(desc(adifUploads.uploadedAt));
    return rows;
  }

  async rejectedQsos(user: AuthUser, uploadId: string) {
    const [upload] = await this.db.db.select({ id: adifUploads.id }).from(adifUploads).where(and(
      eq(adifUploads.id, uploadId), eq(adifUploads.uploadedBy, user.id), eq(adifUploads.source, 'ADIF')
    ));
    if (!upload) throw new NotFoundException('ADIF upload not found');
    return this.db.db.select({
      id: contacts.id, qsoCallsign: contacts.qsoCallsign, qsoDatetime: contacts.qsoDatetime,
      qsoDateUtc: contacts.qsoDateUtc, frequency: contacts.frequency, band: contacts.band, mode: contacts.mode,
      validity: contacts.validity, errorMessage: contacts.errorMessage
    }).from(contacts).where(and(eq(contacts.uploadId, uploadId), ne(contacts.validity, 'VALID'))).orderBy(contacts.qsoDatetime);
  }

  async adminActivationList(query: AdminActivationQuery) {
    const dateExpression = sql`COALESCE(c.qso_date_utc, c.qso_datetime::date, au.uploaded_at::date)`;
    const dateFilter = query.date ? sql`AND ${dateExpression} = ${query.date}::date` : sql``;
    const callsignFilter = query.activatorCallsign?.trim() ? sql`AND COALESCE(NULLIF(activator.callsign, ''), activator.display_name) ILIKE ${`%${query.activatorCallsign.trim()}%`}` : sql``;
    const parkFilter = query.parkReference?.trim() ? sql`AND p.reference ILIKE ${`%${query.parkReference.trim().toUpperCase()}%`}` : sql``;
    const result = await this.db.db.execute(sql`
      SELECT c.user_id AS activator_id,
        p.reference AS park_reference,
        p.name AS park_name,
        ${dateExpression}::text AS activation_date,
        COALESCE(NULLIF(activator.callsign, ''), activator.display_name) AS activator_callsign,
        COUNT(*) FILTER (WHERE c.validity = 'VALID')::int AS valid_qsos,
        COUNT(*)::int AS total_qsos,
        CASE WHEN COUNT(*) FILTER (WHERE c.validity = 'VALID') >= 10 THEN 'VALID' ELSE 'FAILED' END AS status
      FROM contacts c
      INNER JOIN adif_uploads au ON au.id = c.upload_id
      INNER JOIN parks p ON p.id = c.park_id
      INNER JOIN users activator ON activator.id = c.user_id
      WHERE c.park_id IS NOT NULL ${dateFilter} ${callsignFilter} ${parkFilter}
      GROUP BY c.user_id, p.reference, p.name, ${dateExpression}, activator.callsign, activator.display_name
      HAVING COUNT(*) FILTER (WHERE c.validity = 'VALID') > 0
      ORDER BY ${dateExpression} DESC, p.reference, activator_callsign
    `);
    return result.rows;
  }

  async deleteActivation(input: DeleteActivationInput, actor: AuthUser) {
    const reference = input.parkReference.trim().toUpperCase();
    const [park] = await this.db.db.select({ id: parks.id, reference: parks.reference }).from(parks).where(eq(parks.reference, reference));
    if (!park) throw new NotFoundException('Park not found');

    const dayExpression = sql`COALESCE(${contacts.qsoDateUtc}, ${contacts.qsoDatetime}::date, ${adifUploads.uploadedAt}::date)`;
    const matching = await this.db.db.select({ id: contacts.id, uploadId: contacts.uploadId, userId: contacts.userId, hunterUserId: contacts.hunterUserId })
      .from(contacts)
      .innerJoin(adifUploads, eq(contacts.uploadId, adifUploads.id))
      .where(and(eq(contacts.userId, input.activatorId), eq(contacts.parkId, park.id), sql`${dayExpression} = ${input.date}::date`));
    if (!matching.length) return { deletedCount: 0, activatorId: input.activatorId, parkReference: park.reference, activationDate: input.date };

    const contactIds = matching.map((row) => row.id);
    const uploadIds = [...new Set(matching.map((row) => row.uploadId))];
    const affectedUsers = new Set([input.activatorId, ...matching.map((row) => row.hunterUserId).filter((id): id is string => Boolean(id))]);
    await this.db.db.delete(contacts).where(inArray(contacts.id, contactIds));

    for (const uploadId of uploadIds) {
      const counts = await this.db.db.execute(sql`
        SELECT COUNT(*)::int AS contact_count,
          COUNT(*) FILTER (WHERE validity = 'VALID')::int AS valid_count,
          COUNT(*) FILTER (WHERE validity <> 'VALID')::int AS error_count
        FROM contacts WHERE upload_id = ${uploadId}
      `);
      const row = counts.rows[0] as { contact_count: number; valid_count: number; error_count: number };
      await this.db.db.update(adifUploads).set({
        contactCount: row.contact_count,
        validCount: row.valid_count,
        errorCount: row.error_count,
        status: row.error_count === 0 && row.contact_count > 0 ? 'COMPLETED' : 'PARTIAL'
      }).where(eq(adifUploads.id, uploadId));
    }

    await this.db.db.insert(auditEvents).values({
      actorId: actor.id,
      action: 'QSOS_DELETED_FOR_ACTIVATION',
      entityType: 'park_activation',
      entityId: park.id,
      beforeJson: { activatorId: input.activatorId, parkReference: park.reference, activationDate: input.date, deletedCount: contactIds.length, uploadIds }
    });
    for (const userId of affectedUsers) await this.awards.recalculateForUser(userId);
    return { deletedCount: contactIds.length, activatorId: input.activatorId, parkReference: park.reference, activationDate: input.date };
  }

  private async processAdif(uploadId: string, user: AuthUser, park: typeof parks.$inferSelect, buffer: Buffer) {
    await this.db.db.update(adifUploads).set({ status: 'PROCESSING' }).where(eq(adifUploads.id, uploadId));
    try {
      const records = parseAdif(buffer.toString('utf8'));
      const seenHunters = new Set<string>();
      let validCount = 0;
      let errorCount = 0;
      for (const record of records) {
        const callsign = normalizeCallsign(record.CALL ?? '');
        const qsoDatetime = this.parseDate(record);
        let result: QsoResult;
        if (!qsoDatetime) {
          result = await this.storeRejectedQso(uploadId, user, park, callsign || 'UNKNOWN', undefined, record.FREQ, record.BAND, record.MODE, 'INVALID_DATE', 'QSO_DATE/TIME_ON is missing or invalid');
        } else if (seenHunters.has(callsign)) {
          result = await this.storeRejectedQso(uploadId, user, park, callsign, qsoDatetime, record.FREQ, record.BAND, record.MODE, 'DUPLICATE_HUNTER_IN_FILE', 'Only one QSO for a hunter callsign is accepted per ADIF file');
        } else {
          seenHunters.add(callsign);
          result = await this.storeQso(uploadId, user, { parkReference: park.reference, qsoCallsign: callsign, qsoDatetime, frequency: record.FREQ, band: record.BAND, mode: record.MODE });
        }
        if (result.accepted) validCount += 1;
        else errorCount += 1;
      }
      await this.finishUpload(uploadId, records.length, validCount, errorCount);
      await this.awards.recalculateForUser(user.id);
      await this.recalculateAttributedHunters(uploadId);
      await this.events.publish('mpota.adif.processed', { uploadId, userId: user.id, parkReference: park.reference, contactCount: records.length, validCount, errorCount });
    } catch (error) {
      await this.db.db.update(adifUploads).set({ status: 'FAILED', processedAt: new Date() }).where(eq(adifUploads.id, uploadId));
      await this.events.publish('mpota.adif.failed', { uploadId, userId: user.id, error: error instanceof Error ? error.message : 'Unknown processing error' });
    }
  }

  private async storeQso(uploadId: string, user: AuthUser, input: QsoInput): Promise<QsoResult> {
    const park = await this.approvedPark(input.parkReference);
    const qsoCallsign = normalizeCallsign(input.qsoCallsign);
    if (!/^[A-Z0-9./-]{3,32}$/.test(qsoCallsign)) return this.storeRejectedQso(uploadId, user, park, qsoCallsign || 'UNKNOWN', input.qsoDatetime, input.frequency, input.band, input.mode, 'INVALID_CALLSIGN', 'Hunter callsign is invalid');
    const qsoDateUtc = utcDay(input.qsoDatetime);
    const [hunter] = await this.db.db.select({ id: users.id }).from(users).where(and(eq(users.status, 'ACTIVE'), sql`upper(${users.callsign}) = ${qsoCallsign}`));
    const [exact] = await this.db.db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.userId, user.id), eq(contacts.parkId, park.id), eq(contacts.qsoCallsign, qsoCallsign),
      eq(contacts.qsoDatetime, input.qsoDatetime), input.band ? eq(contacts.band, input.band) : isNull(contacts.band),
      input.mode ? eq(contacts.mode, input.mode) : isNull(contacts.mode), input.frequency ? eq(contacts.frequency, input.frequency) : isNull(contacts.frequency), eq(contacts.validity, 'VALID')
    ));
    const reason = exact ? 'DUPLICATE_QSO' : await this.isDailyDuplicate(user, park.id, qsoCallsign, qsoDateUtc) ? 'DUPLICATE_DAILY' : undefined;
    if (reason) return this.storeRejectedQso(uploadId, user, park, qsoCallsign, input.qsoDatetime, input.frequency, input.band, input.mode, reason, reason === 'DUPLICATE_QSO' ? 'This QSO is already recorded' : 'Only one QSO per hunter, activator, park, and UTC day is counted');
    try {
      const [contact] = await this.db.db.insert(contacts).values({
        uploadId, userId: user.id, parkId: park.id, parkReference: park.reference, qsoCallsign,
        qsoDatetime: input.qsoDatetime, qsoDateUtc, frequency: input.frequency, band: input.band, mode: input.mode, hunterUserId: hunter?.id, validity: 'VALID'
      }).returning({ id: contacts.id });
      return { accepted: true, contactId: contact.id, validity: 'VALID' };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.storeRejectedQso(uploadId, user, park, qsoCallsign, input.qsoDatetime, input.frequency, input.band, input.mode, 'DUPLICATE_DAILY', 'Only one QSO per hunter, activator, park, and UTC day is counted');
    }
  }

  private async storeRejectedQso(uploadId: string, user: AuthUser, park: typeof parks.$inferSelect, callsign: string, qsoDatetime: Date | undefined, frequency: string | undefined, band: string | undefined, mode: string | undefined, validity: string, errorMessage: string): Promise<QsoResult> {
    const [contact] = await this.db.db.insert(contacts).values({
      uploadId, userId: user.id, parkId: park.id, parkReference: park.reference, qsoCallsign: callsign,
      qsoDatetime, qsoDateUtc: qsoDatetime ? utcDay(qsoDatetime) : undefined, frequency, band, mode, validity, errorMessage
    }).returning({ id: contacts.id });
    return { accepted: false, contactId: contact.id, validity, errorMessage };
  }

  private async isDailyDuplicate(user: AuthUser, parkId: string, callsign: string, qsoDateUtc: string) {
    const [existing] = await this.db.db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.userId, user.id), eq(contacts.parkId, parkId), eq(contacts.qsoCallsign, callsign),
      eq(contacts.qsoDateUtc, qsoDateUtc), eq(contacts.validity, 'VALID')
    ));
    return Boolean(existing);
  }

  private async finishUpload(uploadId: string, contactCount: number, validCount: number, errorCount: number) {
    return this.db.db.update(adifUploads).set({
      status: errorCount ? 'PARTIAL' : 'COMPLETED', contactCount, validCount, errorCount, processedAt: new Date()
    }).where(eq(adifUploads.id, uploadId));
  }

  private async recalculateAttributedHunters(uploadId: string) {
    const rows = await this.db.db.select({ hunterUserId: contacts.hunterUserId }).from(contacts).where(and(eq(contacts.uploadId, uploadId), ne(contacts.validity, 'INVALID_PARK')));
    for (const hunter of new Set(rows.map((row) => row.hunterUserId).filter((id): id is string => Boolean(id)))) await this.awards.recalculateForUser(hunter);
  }

  private async approvedPark(reference: string) {
    const [park] = await this.db.db.select().from(parks).where(and(eq(parks.reference, reference.trim().toUpperCase()), eq(parks.status, 'APPROVED')));
    if (!park) throw new NotFoundException('Approved park not found');
    return park;
  }

  private publicUpload(upload: typeof adifUploads.$inferSelect, park: typeof parks.$inferSelect) {
    return {
      id: upload.id, originalFilename: upload.originalFilename, source: upload.source, status: upload.status,
      sizeBytes: upload.sizeBytes, contactCount: upload.contactCount, validCount: upload.validCount,
      errorCount: upload.errorCount, uploadedAt: upload.uploadedAt, processedAt: upload.processedAt,
      parkReference: park.reference, parkName: park.name
    };
  }

  private parseDate(record: AdifRecord) {
    if (!record.QSO_DATE || !/^\d{8}$/.test(record.QSO_DATE)) return undefined;
    const time = (record.TIME_ON ?? '000000').replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
    const date = `${record.QSO_DATE.slice(0, 4)}-${record.QSO_DATE.slice(4, 6)}-${record.QSO_DATE.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
