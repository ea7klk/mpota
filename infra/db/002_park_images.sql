-- Idempotent migration for deployments that already initialized the database
-- before park image support was added.
CREATE TABLE IF NOT EXISTS park_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id uuid NOT NULL REFERENCES parks(id),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  image_number integer NOT NULL,
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  content_type varchar(100) NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT park_images_park_number_unique UNIQUE (park_id, image_number)
);

CREATE INDEX IF NOT EXISTS park_images_park_idx ON park_images(park_id, image_number);
