/**
 * migrate_to_neon.js
 * Copies all data from local PostgreSQL to Neon Cloud database.
 * Run once with: node migrate_to_neon.js
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

async function migrate() {
  console.log('\n========== NEON CLOUD MIGRATION ==========');
  console.log('[1] Connecting to local and Neon databases...');

  // ─── Initialize Neon Tables ───────────────────────────────
  console.log('[2] Creating tables on Neon if they don\'t exist...');
  await neonPool.query(`
    CREATE TABLE IF NOT EXISTS farmers (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(15) UNIQUE NOT NULL,
      name VARCHAR(100),
      village VARCHAR(150),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await neonPool.query(`
    CREATE TABLE IF NOT EXISTS soil_data (
      id SERIAL PRIMARY KEY,
      n FLOAT NOT NULL,
      p FLOAT NOT NULL,
      k FLOAT NOT NULL,
      ph FLOAT NOT NULL,
      moisture FLOAT NOT NULL,
      temperature FLOAT NOT NULL,
      humidity FLOAT NOT NULL,
      rainfall FLOAT NOT NULL,
      farmer_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await neonPool.query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      soil_id INTEGER,
      soil_quality VARCHAR(50) NOT NULL,
      recommended_crops JSONB NOT NULL,
      improvement_tips JSONB NOT NULL,
      prediction_confidence FLOAT,
      crop_confidences JSONB,
      model_accuracy FLOAT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await neonPool.query(`
    CREATE TABLE IF NOT EXISTS otp_store (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(15) NOT NULL,
      otp VARCHAR(6) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await neonPool.query(`
    CREATE TABLE IF NOT EXISTS model_metrics (
      id SERIAL PRIMARY KEY,
      version VARCHAR(50) NOT NULL,
      accuracy FLOAT NOT NULL,
      training_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ─── Migrate Farmers ──────────────────────────────────────
  console.log('[3] Migrating farmers...');
  const farmers = await localPool.query('SELECT * FROM farmers ORDER BY id');
  let fCount = 0;
  for (const f of farmers.rows) {
    try {
      await neonPool.query(
        `INSERT INTO farmers (id, phone, name, village, created_at, last_login) 
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (phone) DO NOTHING`,
        [f.id, f.phone, f.name, f.village, f.created_at, f.last_login]
      );
      fCount++;
    } catch(e) { console.log('  Skip farmer:', e.message); }
  }
  console.log(`   -> Migrated ${fCount}/${farmers.rows.length} farmers.`);

  // ─── Migrate Soil Data ────────────────────────────────────
  console.log('[4] Migrating soil_data records...');
  const soilRows = await localPool.query('SELECT * FROM soil_data ORDER BY id');
  let sCount = 0;
  for (const s of soilRows.rows) {
    try {
      await neonPool.query(
        `INSERT INTO soil_data (id, n, p, k, ph, moisture, temperature, humidity, rainfall, farmer_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [s.id, s.n, s.p, s.k, s.ph, s.moisture, s.temperature, s.humidity, s.rainfall, s.farmer_id, s.created_at]
      );
      sCount++;
    } catch(e) { console.log('  Skip soil_data:', e.message); }
  }
  console.log(`   -> Migrated ${sCount}/${soilRows.rows.length} soil records.`);

  // ─── Migrate Predictions ──────────────────────────────────
  console.log('[5] Migrating predictions...');
  const preds = await localPool.query('SELECT * FROM predictions ORDER BY id');
  let pCount = 0;
  for (const p of preds.rows) {
    try {
      await neonPool.query(
        `INSERT INTO predictions (id, soil_id, soil_quality, recommended_crops, improvement_tips, prediction_confidence, crop_confidences, model_accuracy, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [p.id, p.soil_id, p.soil_quality, JSON.stringify(p.recommended_crops), JSON.stringify(p.improvement_tips), p.prediction_confidence, JSON.stringify(p.crop_confidences), p.model_accuracy, p.created_at]
      );
      pCount++;
    } catch(e) { console.log('  Skip prediction:', e.message); }
  }
  console.log(`   -> Migrated ${pCount}/${preds.rows.length} predictions.`);

  // ─── Sync sequences ───────────────────────────────────────
  console.log('[6] Syncing auto-increment sequences on Neon...');
  for (const tbl of ['farmers', 'soil_data', 'predictions']) {
    await neonPool.query(`SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE(MAX(id),1)) FROM ${tbl}`);
  }

  console.log('\n✅ Migration COMPLETE!');
  console.log(`   Farmers: ${fCount} | Soil Records: ${sCount} | Predictions: ${pCount}`);
  console.log('==========================================\n');

  await localPool.end();
  await neonPool.end();
  process.exit(0);
}

migrate().catch(err => {
  console.error('MIGRATION FAILED:', err.message);
  process.exit(1);
});
