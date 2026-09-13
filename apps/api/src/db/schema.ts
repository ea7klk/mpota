import { relations } from 'drizzle-orm';
import { boolean, date, geometry, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const userStatus = pgEnum('user_status', ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'DELETED']);
export const userRole = pgEnum('user_role', ['MEMBER', 'ENTITY_ADMIN', 'AWARD_ADMIN', 'GLOBAL_ADMIN', 'SYSTEM_BOOTSTRAP_ADMIN']);
export const parkStatus = pgEnum('park_status', ['PENDING', 'APPROVED', 'RETIRED', 'REJECTED', 'REMOVED', 'ARCHIVED']);
export const proposalStatus = pgEnum('proposal_status', ['PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED']);
export const awardStatus = pgEnum('award_status', ['DRAFT', 'PENDING_PUBLICATION', 'PUBLISHED', 'RETIRED']);
export const awardType = pgEnum('award_type', ['ACTIVATOR', 'HUNTER', 'COMBINED']);
export const uploadStatus = pgEnum('upload_status', ['RECEIVED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'QUARANTINED']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 160 }).notNull(),
  callsign: varchar('callsign', { length: 32 }),
  locale: varchar('locale', { length: 5 }).notNull().default('en'),
  status: userStatus('status').notNull().default('ACTIVE'),
  role: userRole('role').notNull().default('MEMBER'),
  deactivatedAt: timestamp('deactivated_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const approvalScopes = pgTable('approval_scopes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  countryCodes: text('country_codes').array().notNull().default([]),
  continentCodes: text('continent_codes').array().notNull().default([]),
  allCountries: boolean('all_countries').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const parks = pgTable('parks', {
  id: uuid('id').defaultRandom().primaryKey(),
  reference: varchar('reference', { length: 10 }).notNull().unique(),
  countryIso2: varchar('country_iso2', { length: 2 }).notNull(),
  continentCode: varchar('continent_code', { length: 4 }).notNull(),
  region: varchar('region', { length: 160 }),
  locality: varchar('locality', { length: 160 }),
  latitude: numeric('latitude', { precision: 9, scale: 6 }).notNull(),
  longitude: numeric('longitude', { precision: 9, scale: 6 }).notNull(),
  geom: geometry('geom', { type: 'point', mode: 'xy', srid: 4326 }),
  parkType: varchar('park_type', { length: 64 }).notNull().default('MUNICIPAL_PARK'),
  status: parkStatus('status').notNull().default('PENDING'),
  name: varchar('name', { length: 240 }).notNull(),
  description: text('description'),
  sourceUrl: text('source_url'),
  accessNotes: text('access_notes'),
  photoUrl: text('photo_url'),
  createdBy: uuid('created_by').references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  removedBy: uuid('removed_by').references(() => users.id),
  removedAt: timestamp('removed_at'),
  removalReason: text('removal_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const parkImages = pgTable('park_images', {
  id: uuid('id').defaultRandom().primaryKey(),
  parkId: uuid('park_id').notNull().references(() => parks.id),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  imageNumber: integer('image_number').notNull(),
  objectKey: text('object_key').notNull().unique(),
  originalFilename: text('original_filename').notNull(),
  contentType: varchar('content_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({ parkImageNumberUnique: uniqueIndex('park_images_park_number_unique').on(table.parkId, table.imageNumber) }));

export const parkProposals = pgTable('park_proposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  countryIso2: varchar('country_iso2', { length: 2 }).notNull(),
  continentCode: varchar('continent_code', { length: 4 }).notNull(),
  region: varchar('region', { length: 160 }),
  locality: varchar('locality', { length: 160 }),
  latitude: numeric('latitude', { precision: 9, scale: 6 }).notNull(),
  longitude: numeric('longitude', { precision: 9, scale: 6 }).notNull(),
  parkType: varchar('park_type', { length: 64 }).notNull().default('MUNICIPAL_PARK'),
  name: varchar('name', { length: 240 }).notNull(),
  description: text('description'),
  sourceUrl: text('source_url'),
  accessNotes: text('access_notes'),
  photoUrl: text('photo_url'),
  status: proposalStatus('status').notNull().default('PENDING'),
  reviewNotes: text('review_notes'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const moderationDecisions = pgTable('moderation_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  proposalId: uuid('proposal_id').notNull().references(() => parkProposals.id),
  decidedBy: uuid('decided_by').notNull().references(() => users.id),
  decision: proposalStatus('decision').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const countrySequences = pgTable('country_sequences', {
  countryIso2: varchar('country_iso2', { length: 2 }).primaryKey(),
  nextValue: integer('next_value').notNull().default(1)
});

export const awards = pgTable('awards', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 120 }).notNull().unique(),
  name: varchar('name', { length: 240 }).notNull(),
  description: text('description'),
  iconUrl: text('icon_url'),
  status: awardStatus('status').notNull().default('DRAFT'),
  type: awardType('type').notNull(),
  scopeCountries: text('scope_countries').array().notNull().default([]),
  scopeContinents: text('scope_continents').array().notNull().default([]),
  allCountries: boolean('all_countries').notNull().default(false),
  version: integer('version').notNull().default(1),
  ruleDefinition: jsonb('rule_definition').notNull().default({}),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  publishedBy: uuid('published_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  publishedAt: timestamp('published_at'),
  retiredAt: timestamp('retired_at')
});

export const awardProgress = pgTable('award_progress', {
  userId: uuid('user_id').notNull().references(() => users.id),
  awardId: uuid('award_id').notNull().references(() => awards.id),
  currentValue: integer('current_value').notNull().default(0),
  requiredValue: integer('required_value').notNull().default(1),
  status: varchar('status', { length: 32 }).notNull().default('IN_PROGRESS'),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const awardGrants = pgTable('award_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  awardId: uuid('award_id').notNull().references(() => awards.id),
  awardVersion: integer('award_version').notNull(),
  evidenceSnapshot: jsonb('evidence_snapshot').notNull().default({}),
  grantedAt: timestamp('granted_at').notNull().defaultNow()
});

export const adifUploads = pgTable('adif_uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  parkId: uuid('park_id').references(() => parks.id),
  source: varchar('source', { length: 16 }).notNull().default('ADIF'),
  objectKey: text('object_key').notNull().unique(),
  originalFilename: text('original_filename').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  status: uploadStatus('status').notNull().default('RECEIVED'),
  contactCount: integer('contact_count').notNull().default(0),
  validCount: integer('valid_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at')
});

export const contacts = pgTable('contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  uploadId: uuid('upload_id').notNull().references(() => adifUploads.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  parkId: uuid('park_id').references(() => parks.id),
  hunterUserId: uuid('hunter_user_id').references(() => users.id),
  parkReference: varchar('park_reference', { length: 10 }),
  qsoCallsign: varchar('qso_callsign', { length: 32 }).notNull(),
  qsoDatetime: timestamp('qso_datetime'),
  qsoDateUtc: date('qso_date_utc'),
  frequency: varchar('frequency', { length: 32 }),
  band: varchar('band', { length: 32 }),
  mode: varchar('mode', { length: 32 }),
  validity: varchar('validity', { length: 32 }).notNull().default('VALID'),
  errorMessage: text('error_message')
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 120 }).notNull(),
  entityType: varchar('entity_type', { length: 80 }).notNull(),
  entityId: uuid('entity_id'),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  requestId: varchar('request_id', { length: 120 }),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const userRelations = relations(users, ({ many }) => ({ proposals: many(parkProposals), scopes: many(approvalScopes), uploads: many(adifUploads), awards: many(awards) }));
