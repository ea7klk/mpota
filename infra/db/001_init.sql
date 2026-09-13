CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

DO $$ BEGIN CREATE TYPE user_status AS ENUM ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','DEACTIVATED','DELETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('MEMBER','ENTITY_ADMIN','AWARD_ADMIN','GLOBAL_ADMIN','SYSTEM_BOOTSTRAP_ADMIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE park_status AS ENUM ('PENDING','APPROVED','REJECTED','REMOVED','ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE proposal_status AS ENUM ('PENDING','CHANGES_REQUESTED','APPROVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE award_status AS ENUM ('DRAFT','PENDING_PUBLICATION','PUBLISHED','RETIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE award_type AS ENUM ('ACTIVATOR','HUNTER','COMBINED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE upload_status AS ENUM ('RECEIVED','PROCESSING','COMPLETED','PARTIAL','FAILED','QUARANTINED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(320) NOT NULL UNIQUE, password_hash text NOT NULL,
  display_name varchar(160) NOT NULL, callsign varchar(32), locale varchar(5) NOT NULL DEFAULT 'en',
  status user_status NOT NULL DEFAULT 'ACTIVE', role user_role NOT NULL DEFAULT 'MEMBER',
  deactivated_at timestamptz, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS approval_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  country_codes text[] NOT NULL DEFAULT '{}', continent_codes text[] NOT NULL DEFAULT '{}',
  all_countries boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS country_sequences (country_iso2 varchar(2) PRIMARY KEY, next_value integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS parks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference varchar(10) NOT NULL UNIQUE,
  country_iso2 varchar(2) NOT NULL, continent_code varchar(4) NOT NULL, region varchar(160), locality varchar(160),
  latitude numeric(9,6) NOT NULL, longitude numeric(9,6) NOT NULL, geom geometry(Point,4326),
  park_type varchar(64) NOT NULL DEFAULT 'MUNICIPAL_PARK', status park_status NOT NULL DEFAULT 'PENDING',
  name varchar(240) NOT NULL, description text, source_url text, access_notes text, photo_url text,
  created_by uuid REFERENCES users(id), approved_by uuid REFERENCES users(id), approved_at timestamptz,
  removed_by uuid REFERENCES users(id), removed_at timestamptz, removal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parks_geom_gist ON parks USING gist (geom);
CREATE INDEX IF NOT EXISTS parks_public_status_idx ON parks(status, country_iso2);
CREATE TABLE IF NOT EXISTS park_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), park_id uuid NOT NULL REFERENCES parks(id), uploaded_by uuid NOT NULL REFERENCES users(id),
  image_number integer NOT NULL, object_key text NOT NULL UNIQUE, original_filename text NOT NULL,
  content_type varchar(100) NOT NULL, size_bytes integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT park_images_park_number_unique UNIQUE (park_id, image_number)
);
CREATE INDEX IF NOT EXISTS park_images_park_idx ON park_images(park_id, image_number);
CREATE TABLE IF NOT EXISTS park_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submitted_by uuid NOT NULL REFERENCES users(id),
  country_iso2 varchar(2) NOT NULL, continent_code varchar(4) NOT NULL, region varchar(160), locality varchar(160),
  latitude numeric(9,6) NOT NULL, longitude numeric(9,6) NOT NULL, park_type varchar(64) NOT NULL DEFAULT 'MUNICIPAL_PARK',
  name varchar(240) NOT NULL, description text, source_url text, access_notes text, photo_url text,
  status proposal_status NOT NULL DEFAULT 'PENDING', review_notes text, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moderation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES park_proposals(id),
  decided_by uuid NOT NULL REFERENCES users(id), decision proposal_status NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key varchar(120) NOT NULL UNIQUE, name varchar(240) NOT NULL,
  description text, icon_url text, status award_status NOT NULL DEFAULT 'DRAFT', type award_type NOT NULL,
  scope_countries text[] NOT NULL DEFAULT '{}', scope_continents text[] NOT NULL DEFAULT '{}', all_countries boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1, rule_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id), published_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz, retired_at timestamptz
);
CREATE TABLE IF NOT EXISTS award_progress (
  user_id uuid NOT NULL REFERENCES users(id), award_id uuid NOT NULL REFERENCES awards(id), current_value integer NOT NULL DEFAULT 0,
  required_value integer NOT NULL DEFAULT 1, status varchar(32) NOT NULL DEFAULT 'IN_PROGRESS', updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, award_id)
);
CREATE TABLE IF NOT EXISTS award_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), award_id uuid NOT NULL REFERENCES awards(id),
  award_version integer NOT NULL, evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, award_id, award_version)
);
CREATE TABLE IF NOT EXISTS adif_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), uploaded_by uuid NOT NULL REFERENCES users(id), park_id uuid REFERENCES parks(id),
  source varchar(16) NOT NULL DEFAULT 'ADIF', object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL, sha256 varchar(64) NOT NULL, size_bytes integer NOT NULL,
  status upload_status NOT NULL DEFAULT 'RECEIVED', contact_count integer NOT NULL DEFAULT 0, valid_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), upload_id uuid NOT NULL REFERENCES adif_uploads(id), user_id uuid NOT NULL REFERENCES users(id),
  park_id uuid REFERENCES parks(id), park_reference varchar(10), qso_callsign varchar(32) NOT NULL, qso_datetime timestamptz, qso_date_utc date,
  band varchar(32), mode varchar(32), validity varchar(32) NOT NULL DEFAULT 'VALID', error_message text
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_daily_hunter_unique
  ON contacts(user_id, park_id, qso_callsign, qso_date_utc)
  WHERE validity = 'VALID' AND park_id IS NOT NULL AND qso_date_utc IS NOT NULL;
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), action varchar(120) NOT NULL,
  entity_type varchar(80) NOT NULL, entity_id uuid, before_json jsonb, after_json jsonb, request_id varchar(120), created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO parks (reference, country_iso2, continent_code, latitude, longitude, name, description, status, geom)
VALUES
  ('MPES-00001','ES','EU',40.416800,-3.703800,'Parque Municipal del Retiro','A central municipal park in Madrid.','APPROVED',ST_SetSRID(ST_MakePoint(-3.703800,40.416800),4326)),
  ('MPFR-00001','FR','EU',48.856600,2.352200,'Parc municipal de Paris','An accessible urban park reference example.','APPROVED',ST_SetSRID(ST_MakePoint(2.352200,48.856600),4326)),
  ('MPDE-00001','DE','EU',52.520000,13.405000,'Kommunaler Park Berlin','A municipal park reference example.','APPROVED',ST_SetSRID(ST_MakePoint(13.405000,52.520000),4326))
ON CONFLICT (reference) DO NOTHING;
