/**
 * fix_neon_schema.js - Patches Neon schema to match local schema, then migrates predictions
 */
const { Pool } = require('pg');

const LOCAL_URL = process.env.SOURCE_DATABASE_URL;
const NEON_URL = process.env.TARGET_DATABASE_URL;
if (!LOCAL_URL || !NEON_URL) {
  console.error('Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL. Do not hardcode credentials.');
  process.exit(1);
}

const localPool = new Pool({ connectionString: LOCAL_URL });
const neonPool  = new Pool({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  console.log('\n========== NEON SCHEMA FIX & PREDICTION MIGRATION ==========');

  // Alter Neon predictions table to add missing columns
  console.log('[1] Adding missing columns to Neon predictions table...');
  const cols = [
    `ALTER TABLE predictions ADD COLUMN IF NOT EXISTS prediction_confidence FLOAT`,
    `ALTER TABLE predictions ADD COLUMN IF NOT EXISTS crop_confidences JSONB`,
    `ALTER TABLE predictions ADD COLUMN IF NOT EXISTS model_accuracy FLOAT`,
  ];
  for (const col of cols) {
    try {
      await neonPool.query(col);
      console.log('  OK:', col.split('ADD COLUMN IF NOT EXISTS')[1].trim());
    } catch(e) { console.log('  Error:', e.message); }
  }

  // Get all predictions from local
  console.log('[2] Fetching all predictions from local DB...');
  const preds = await localPool.query('SELECT * FROM predictions ORDER BY id');
  console.log(`   Found ${preds.rows.length} predictions.`);

  // Clear existing predictions from Neon to avoid duplicate conflicts
  console.log('[3] Clearing existing predictions on Neon (clean re-insert)...');
  await neonPool.query('DELETE FROM predictions');

  // Bulk insert
  console.log('[4] Inserting all predictions into Neon...');
  let pCount = 0;
  for (const p of preds.rows) {
    try {
      await neonPool.query(
        `INSERT INTO predictions (id, soil_id, soil_quality, recommended_crops, improvement_tips, prediction_confidence, crop_confidences, model_accuracy, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [p.id, p.soil_id, p.soil_quality, JSON.stringify(p.recommended_crops), JSON.stringify(p.improvement_tips),
         p.prediction_confidence, JSON.stringify(p.crop_confidences), p.model_accuracy, p.created_at]
      );
      pCount++;
    } catch(e) { console.log(`  Skip prediction ${p.id}:`, e.message); }
  }

  // Reset sequence
  await neonPool.query(`SELECT setval(pg_get_serial_sequence('predictions', 'id'), COALESCE(MAX(id),1)) FROM predictions`);

  console.log(`\n[DONE] Migrated ${pCount}/${preds.rows.length} predictions to Neon.`);
  console.log('=============================================================\n');

  await localPool.end();
  await neonPool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
