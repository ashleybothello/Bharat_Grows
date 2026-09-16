/**
 * Connectivity probe for the telemetry database.
 *
 * Reads DATABASE_URL (or an override passed as argv[2]) and reports the
 * database name plus existing public tables. Read-only: creates nothing.
 *
 *   node scripts/check-db.js
 *   node scripts/check-db.js "postgresql://..."
 */

const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { poolConfigFromUrl } = require('../db');

const url = process.argv[2] || process.env.DATABASE_URL;

if (!url) {
  console.log('No DATABASE_URL set and no connection string passed.');
  process.exit(2);
}

const cfg = poolConfigFromUrl(url);
if (!cfg) {
  console.log('DATABASE_URL could not be parsed.');
  process.exit(2);
}

const pool = new Pool({
  ...cfg,
  connectionTimeoutMillis: 15000,
});

(async () => {
  try {
    const meta = await pool.query('SELECT current_database() AS db');
    console.log('CONNECTED:', meta.rows[0].db);

    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log('TABLES:', tables.rows.map((r) => r.table_name).join(', ') || '(none)');
    process.exit(0);
  } catch (err) {
    console.log('FAILED:', err.message);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();
