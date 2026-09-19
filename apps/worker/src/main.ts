import { connect, StringCodec } from 'nats';
import { Pool } from 'pg';

type ProcessedEvent = { uploadId: string; userId: string; contactCount: number; errorCount: number };

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? 'nats://localhost:4222' });
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const sc = StringCodec();
  const subscription = nc.subscribe('mpota.adif.processed');
  console.log('award-worker listening on mpota.adif.processed');
  for await (const message of subscription) {
    try { await evaluate(db, JSON.parse(sc.decode(message.data)) as ProcessedEvent); }
    catch (error) { console.error('award evaluation failed', error); }
  }
}

async function evaluate(db: Pool, event: ProcessedEvent) {
  const { rows: hunterRows } = await db.query(`SELECT DISTINCT hunter_user_id FROM contacts WHERE upload_id = $1 AND hunter_user_id IS NOT NULL`, [event.uploadId]);
  const userIds = Array.from(new Set([event.userId, ...hunterRows.map((row) => row.hunter_user_id)]));
  const { rows: published } = await db.query(`SELECT id, version, type, scope_countries, scope_continents, all_countries, rule_definition FROM awards WHERE status = 'PUBLISHED'`);
  for (const userId of userIds) {
    for (const award of published) {
      const required = Number((award.rule_definition as { minimumEntities?: number }).minimumEntities ?? 1);
      const qualifyingParks = award.type === 'ACTIVATOR'
        ? `SELECT c.park_id FROM contacts c WHERE c.user_id = $1 AND c.validity = 'VALID' AND c.park_id IS NOT NULL AND c.qso_date_utc IS NOT NULL GROUP BY c.user_id, c.park_id, c.qso_date_utc HAVING COUNT(*) >= 5`
        : award.type === 'HUNTER'
          ? `SELECT DISTINCT c.park_id FROM contacts c WHERE c.hunter_user_id = $1 AND c.validity = 'VALID' AND c.park_id IS NOT NULL`
          : `SELECT c.park_id FROM contacts c WHERE c.user_id = $1 AND c.validity = 'VALID' AND c.park_id IS NOT NULL AND c.qso_date_utc IS NOT NULL GROUP BY c.user_id, c.park_id, c.qso_date_utc HAVING COUNT(*) >= 5 UNION SELECT DISTINCT c.park_id FROM contacts c WHERE c.hunter_user_id = $1 AND c.validity = 'VALID' AND c.park_id IS NOT NULL`;
      const { rows } = await db.query(`WITH qualifying_parks AS (${qualifyingParks})
        SELECT COUNT(DISTINCT qp.park_id)::int AS value
        FROM qualifying_parks qp INNER JOIN parks p ON p.id = qp.park_id
        WHERE ($4 OR ((cardinality($2::text[]) = 0 AND cardinality($3::text[]) = 0) OR p.country_iso2 = ANY($2::text[]) OR p.continent_code = ANY($3::text[])))`,
        [userId, award.scope_countries ?? [], award.scope_continents ?? [], award.all_countries ?? false]);
      const current = Number(rows[0]?.value ?? 0);
      await db.query(`INSERT INTO award_progress (user_id, award_id, current_value, required_value, status, updated_at)
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (user_id, award_id) DO UPDATE SET current_value = EXCLUDED.current_value, required_value = EXCLUDED.required_value, status = EXCLUDED.status, updated_at = now()`,
        [userId, award.id, current, required, current >= required ? 'EARNED' : 'IN_PROGRESS']);
      if (current >= required) {
        await db.query(`INSERT INTO award_grants (user_id, award_id, award_version, evidence_snapshot)
          VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, award_id, award_version) DO NOTHING`, [userId, award.id, award.version, JSON.stringify({ qualifyingEntities: current, uploadId: event.uploadId })]);
      }
    }
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
