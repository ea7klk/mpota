-- Allow historical contacts to be attributed to a registered hunter and add the explicit retired state.
ALTER TYPE park_status ADD VALUE IF NOT EXISTS 'RETIRED';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS hunter_user_id uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS contacts_hunter_user_idx ON contacts(hunter_user_id, validity);
