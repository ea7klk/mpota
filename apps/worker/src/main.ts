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
  const { rows: published } = await db.query(`SELECT id, version, rule_definition FROM awards WHERE status = 'PUBLISHED'`);
  for (const award of published) {
    const required = Number((award.rule_definition as { minimumEntities?: number }).minimumEntities ?? 1);
    const { rows } = await db.query(`SELECT COUNT(DISTINCT park_id)::int AS value FROM contacts WHERE user_id = $1 AND validity = 'VALID' AND park_id IS NOT NULL`, [event.userId]);
    const current = Number(rows[0]?.value ?? 0);
    await db.query(`INSERT INTO award_progress (user_id, award_id, current_value, required_value, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (user_id, award_id) DO UPDATE SET current_value = EXCLUDED.current_value, required_value = EXCLUDED.required_value, status = EXCLUDED.status, updated_at = now()`,
      [event.userId, award.id, current, required, current >= required ? 'EARNED' : 'IN_PROGRESS']);
    if (current >= required) {
      await db.query(`INSERT INTO award_grants (user_id, award_id, award_version, evidence_snapshot)
        VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, award_id, award_version) DO NOTHING`, [event.userId, award.id, award.version, JSON.stringify({ qualifyingEntities: current, uploadId: event.uploadId })]);
    }
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
