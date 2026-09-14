-- Database-backed system settings and SYSTEM_ADMIN role.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SYSTEM_ADMIN';

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key varchar(120) PRIMARY KEY,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings (setting_key, value_json)
VALUES ('park_types', '[
  {"code":"MUNICIPAL_PARK","labels":{"en":"Municipal park","es":"Parque municipal","fr":"Parc municipal","de":"Kommunaler Park"},"active":true,"sortOrder":10},
  {"code":"URBAN_FOREST","labels":{"en":"Urban forest","es":"Bosque urbano","fr":"Forêt urbaine","de":"Stadtwald"},"active":true,"sortOrder":20},
  {"code":"BOTANICAL_GARDEN","labels":{"en":"Botanical garden","es":"Jardín botánico","fr":"Jardin botanique","de":"Botanischer Garten"},"active":true,"sortOrder":30}
]'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, value_json)
VALUES ('translations', '{}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
