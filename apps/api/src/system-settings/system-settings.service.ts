import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AuthUser } from '../auth/auth.types';
import { DbService } from '../db/db.service';
import { auditEvents, systemSettings } from '../db/schema';

export type ParkTypeSetting = {
  code: string;
  labels: Record<string, string>;
  active: boolean;
  sortOrder: number;
};

export type SystemSettingsValue = {
  parkTypes: ParkTypeSetting[];
  translations: Record<string, unknown>;
};

export const DEFAULT_PARK_TYPES: ParkTypeSetting[] = [
  { code: 'MUNICIPAL_PARK', labels: { en: 'Municipal park', es: 'Parque municipal', fr: 'Parc municipal', de: 'Kommunaler Park' }, active: true, sortOrder: 10 },
  { code: 'URBAN_FOREST', labels: { en: 'Urban forest', es: 'Bosque urbano', fr: 'Forêt urbaine', de: 'Stadtwald' }, active: true, sortOrder: 20 },
  { code: 'BOTANICAL_GARDEN', labels: { en: 'Botanical garden', es: 'Jardín botánico', fr: 'Jardin botanique', de: 'Botanischer Garten' }, active: true, sortOrder: 30 }
];

@Injectable()
export class SystemSettingsService {
  constructor(private readonly db: DbService) {}

  async publicSettings(): Promise<SystemSettingsValue> {
    const rows = await this.db.db.select().from(systemSettings);
    const parkTypes = this.readParkTypes(rows.find((row) => row.settingKey === 'park_types')?.valueJson);
    const translations = this.readObject(rows.find((row) => row.settingKey === 'translations')?.valueJson);
    return { parkTypes, translations };
  }

  async adminSettings() {
    return this.publicSettings();
  }

  async update(user: AuthUser, input: { parkTypes?: unknown; translations?: unknown }) {
    if (!['GLOBAL_ADMIN', 'SYSTEM_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Global or system admin role required');
    }
    const current = await this.publicSettings();
    const parkTypes = input.parkTypes === undefined ? current.parkTypes : this.validateParkTypes(input.parkTypes);
    const translations = input.translations === undefined ? current.translations : this.validateTranslations(input.translations);
    await this.db.db.transaction(async (tx) => {
      await tx.insert(systemSettings).values({ settingKey: 'park_types', valueJson: parkTypes, updatedBy: user.id, updatedAt: new Date() })
        .onConflictDoUpdate({ target: systemSettings.settingKey, set: { valueJson: parkTypes, updatedBy: user.id, updatedAt: new Date() } });
      await tx.insert(systemSettings).values({ settingKey: 'translations', valueJson: translations, updatedBy: user.id, updatedAt: new Date() })
        .onConflictDoUpdate({ target: systemSettings.settingKey, set: { valueJson: translations, updatedBy: user.id, updatedAt: new Date() } });
      await tx.insert(auditEvents).values({ actorId: user.id, action: 'SYSTEM_SETTINGS_UPDATED', entityType: 'system_settings', afterJson: { parkTypes, translations } });
    });
    return { parkTypes, translations };
  }

  async assertParkType(code: string | undefined) {
    const normalized = (code ?? 'MUNICIPAL_PARK').trim().toUpperCase();
    const settings = await this.publicSettings();
    if (!settings.parkTypes.some((type) => type.active && type.code === normalized)) {
      throw new BadRequestException(`Unknown or inactive park type: ${normalized}`);
    }
    return normalized;
  }

  private readObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private readParkTypes(value: unknown): ParkTypeSetting[] {
    if (!Array.isArray(value)) return DEFAULT_PARK_TYPES;
    const valid = value.filter((item): item is ParkTypeSetting => Boolean(item && typeof item === 'object' && typeof (item as ParkTypeSetting).code === 'string'))
      .map((item) => ({
        code: item.code.trim().toUpperCase(),
        labels: this.readObject(item.labels) as Record<string, string>,
        active: item.active !== false,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : 0
      }));
    return valid.length ? valid.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)) : DEFAULT_PARK_TYPES;
  }

  private validateParkTypes(value: unknown): ParkTypeSetting[] {
    if (!Array.isArray(value) || !value.length) throw new BadRequestException('At least one park type is required');
    const result = value.map((item, index) => {
      if (!item || typeof item !== 'object') throw new BadRequestException(`Invalid park type at index ${index}`);
      const candidate = item as Partial<ParkTypeSetting>;
      const code = String(candidate.code ?? '').trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) throw new BadRequestException(`Invalid park type code at index ${index}`);
      const labels = this.readObject(candidate.labels);
      const normalizedLabels = Object.fromEntries(Object.entries(labels).map(([locale, label]) => [locale, String(label).trim()]).filter(([, label]) => Boolean(label)));
      if (!Object.keys(normalizedLabels).length) throw new BadRequestException(`Park type ${code} needs at least one label`);
      return { code, labels: normalizedLabels, active: candidate.active !== false, sortOrder: Number(candidate.sortOrder ?? (index + 1) * 10) };
    });
    if (new Set(result.map((type) => type.code)).size !== result.length) throw new BadRequestException('Park type codes must be unique');
    if (!result.some((type) => type.active)) throw new BadRequestException('At least one park type must remain active');
    return result.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  }

  private validateTranslations(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Translations must be an object keyed by locale');
    const allowed = new Set(['en', 'es', 'fr', 'de']);
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([locale, catalog]) => allowed.has(locale) && catalog && typeof catalog === 'object'));
  }
}
