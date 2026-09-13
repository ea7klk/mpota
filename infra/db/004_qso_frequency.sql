-- Persist the frequency entered in manual QSOs and supplied by ADIF records.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS frequency varchar(32);
