import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { adifUploads, contacts, parks } from '../db/schema';
import { AuthUser } from '../auth/auth.types';
import { EventsService } from '../events/events.service';
import { StorageService } from './storage.service';

type AdifRecord = Record<string, string>;

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

@Injectable()
export class UploadsService {
  constructor(private readonly db: DbService, private readonly storage: StorageService, private readonly events: EventsService) {}

  async upload(user: AuthUser, file: Express.Multer.File) {
    if (!file || !/\.(adi|adif)$/i.test(file.originalname)) throw new BadRequestException('Upload an .adi or .adif file');
    const key = `${user.id}/${Date.now()}-${file.originalname.replace(/[^a-z0-9._-]/gi, '_')}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(key, file.buffer, file.mimetype || 'application/octet-stream');
    const [upload] = await this.db.db.insert(adifUploads).values({ uploadedBy: user.id, objectKey: key, originalFilename: file.originalname, sha256, sizeBytes: file.size, status: 'PROCESSING' }).returning();
    const records = parseAdif(file.buffer.toString('utf8'));
    const references = [...new Set(records.map((r) => r.MP_REF || r.POTA_REF).filter(Boolean))] as string[];
    const approved = references.length ? await this.db.db.select({ id: parks.id, reference: parks.reference }).from(parks).where(inArray(parks.reference, references)) : [];
    const approvedByRef = new Map(approved.map((park) => [park.reference, park.id]));
    let errors = 0;
    for (const record of records) {
      const reference = (record.MP_REF || record.POTA_REF || '').toUpperCase() || undefined;
      const parkId = reference ? approvedByRef.get(reference) : undefined;
      const validity = reference && !parkId ? 'INVALID_PARK' : 'VALID';
      if (validity !== 'VALID') errors += 1;
      await this.db.db.insert(contacts).values({ uploadId: upload.id, userId: user.id, parkId, parkReference: reference, qsoCallsign: record.CALL, qsoDatetime: this.parseDate(record), band: record.BAND, mode: record.MODE, validity, errorMessage: validity === 'VALID' ? undefined : 'Reference is not an approved MPOTA entity' });
    }
    const [completed] = await this.db.db.update(adifUploads).set({ status: errors ? 'PARTIAL' : 'COMPLETED', contactCount: records.length, errorCount: errors, processedAt: new Date() }).where(eq(adifUploads.id, upload.id)).returning();
    await this.events.publish('mpota.adif.processed', { uploadId: upload.id, userId: user.id, contactCount: records.length, errorCount: errors });
    return completed;
  }

  list(user: AuthUser) { return this.db.db.select().from(adifUploads).where(eq(adifUploads.uploadedBy, user.id)); }

  private parseDate(record: AdifRecord) {
    if (!record.QSO_DATE) return undefined;
    const date = `${record.QSO_DATE.slice(0, 4)}-${record.QSO_DATE.slice(4, 6)}-${record.QSO_DATE.slice(6, 8)}T${(record.TIME_ON ?? '000000').padEnd(6, '0').slice(0, 2)}:${(record.TIME_ON ?? '000000').slice(2, 4)}:${(record.TIME_ON ?? '000000').slice(4, 6)}Z`;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
