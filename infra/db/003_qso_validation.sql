-- QSO validation and park-specific ADIF migration.
ALTER TABLE adif_uploads ADD COLUMN IF NOT EXISTS park_id uuid REFERENCES parks(id);
ALTER TABLE adif_uploads ADD COLUMN IF NOT EXISTS source varchar(16) NOT NULL DEFAULT 'ADIF';
ALTER TABLE adif_uploads ADD COLUMN IF NOT EXISTS valid_count integer NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS qso_date_utc date;

UPDATE contacts
SET qso_date_utc = (qso_datetime AT TIME ZONE 'UTC')::date
WHERE qso_date_utc IS NULL AND qso_datetime IS NOT NULL;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, park_id, qso_callsign, qso_date_utc
    ORDER BY qso_datetime NULLS LAST, id
  ) AS row_number
  FROM contacts
  WHERE validity = 'VALID' AND park_id IS NOT NULL AND qso_date_utc IS NOT NULL
)
UPDATE contacts c
SET validity = 'DUPLICATE_DAILY', error_message = 'Only one QSO per hunter, activator, park, and UTC day is counted'
FROM ranked r
WHERE c.id = r.id AND r.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_daily_hunter_unique
  ON contacts(user_id, park_id, qso_callsign, qso_date_utc)
  WHERE validity = 'VALID' AND park_id IS NOT NULL AND qso_date_utc IS NOT NULL;
