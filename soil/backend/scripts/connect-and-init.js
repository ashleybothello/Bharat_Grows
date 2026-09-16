/**
 * Connect using DATABASE_URL (session pooler) and ensure schema exists.
 * Prints database name and whether telemetry tables are present. Never logs the URL.
 */
const { pool, initDB } = require('../db');

(async () => {
  try {
    const r = await pool.query('SELECT current_database() AS db');
    console.log('CONNECTED', r.rows[0].db);
    await initDB();
    console.log('SCHEMA_INIT_DONE');
    process.exit(0);
  } catch (err) {
    console.log('FAILED', err.code || '', err.message);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();
