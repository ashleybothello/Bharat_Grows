/** final_sync.js - syncs remaining soil_data and predictions that were added during migration */
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
  console.log('\n========== FINAL SYNC ==========');

  // Get max id in neon soil_data
  const maxSoil = await neonPool.query('SELECT MAX(id) FROM soil_data');
  const maxSoilId = maxSoil.rows[0].max || 0;
  console.log(`[1] Neon soil_data max id = ${maxSoilId}`);

  const newSoil = await localPool.query('SELECT * FROM soil_data WHERE id > $1 ORDER BY id', [maxSoilId]);
  console.log(`   Inserting ${newSoil.rows.length} new soil_data rows...`);
  let sc = 0;
  for (const s of newSoil.rows) {
    try {
      await neonPool.query(
        `INSERT INTO soil_data (id, n, p, k, ph, moisture, temperature, humidity, rainfall, farmer_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [s.id, s.n, s.p, s.k, s.ph, s.moisture, s.temperature, s.humidity, s.rainfall, s.farmer_id, s.created_at]
      );
      sc++;
    } catch(e) { console.log('  soil skip:', e.message); }
  }
  console.log(`   -> Inserted ${sc} soil rows.`);

  // Get max id in neon predictions  
  const maxPred = await neonPool.query('SELECT MAX(id) FROM predictions');
  const maxPredId = maxPred.rows[0].max || 0;
  console.log(`[2] Neon predictions max id = ${maxPredId}`);

  const newPreds = await localPool.query('SELECT * FROM predictions WHERE id > $1 ORDER BY id', [maxPredId]);
  console.log(`   Inserting ${newPreds.rows.length} new prediction rows...`);
  let pc = 0;
  for (const p of newPreds.rows) {
    try {
      await neonPool.query(
        `INSERT INTO predictions (id, soil_id, soil_quality, recommended_crops, improvement_tips, prediction_confidence, crop_confidences, model_accuracy, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [p.id, p.soil_id, p.soil_quality, JSON.stringify(p.recommended_crops), JSON.stringify(p.improvement_tips), p.prediction_confidence, JSON.stringify(p.crop_confidences), p.model_accuracy, p.created_at]
      );
      pc++;
    } catch(e) { console.log(`  pred skip ${p.id}:`, e.message); }
  }
  console.log(`   -> Inserted ${pc} prediction rows.`);

  // Sync sequences
  for (const tbl of ['soil_data', 'predictions']) {
    await neonPool.query(`SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE(MAX(id),1)) FROM ${tbl}`);
  }
  console.log('[3] Sequences synced.');
  console.log('=== SYNC COMPLETE ===\n');
  await localPool.end(); await neonPool.end(); process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
