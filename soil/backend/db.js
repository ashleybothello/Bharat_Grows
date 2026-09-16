const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

function sslFor(url) {
  if (!url) return undefined;
  if (/supabase\.co|neon\.tech|amazonaws\.com|render\.com/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

/**
 * Parse DATABASE_URL with the WHATWG URL parser so:
 *  - passwords containing @ stay intact (%40)
 *  - pooler usernames like postgres.<project-ref> are not split at the dot
 *    (pg-connection-string treats that as user "postgres")
 */
function poolConfigFromUrl(raw) {
  if (!raw) return null;
  const u = new URL(raw);
  const database = decodeURIComponent((u.pathname || '').replace(/^\//, '')) || 'postgres';
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: u.username,
    password: u.password,
    database,
    ssl: sslFor(raw),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
  };
}

const poolCfg = poolConfigFromUrl(process.env.DATABASE_URL);
const pool = new Pool(poolCfg || {});

pool.on('error', (err) => {
  console.error('[pg] idle client error:', err.code || err.message);
});

const initDB = async () => {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set — OTP auth will use an in-memory store.');
    return;
  }

  try {
    await pool.query(`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        soil_id INTEGER REFERENCES soil_data(id),
        soil_quality VARCHAR(50) NOT NULL,
        recommended_crops JSONB NOT NULL,
        improvement_tips JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // model_metrics is kept here if we want to store it, but right now
    // ML service stores it locally and we fetch it through /api/metrics.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS model_metrics (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL,
        accuracy FLOAT NOT NULL,
        training_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS farmers (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(15) UNIQUE NOT NULL,
        name VARCHAR(100),
        village VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`ALTER TABLE farmers ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE farmers ADD COLUMN IF NOT EXISTS profile JSONB DEFAULT '{}'::jsonb;`);
    await pool.query(`ALTER TABLE farmers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS farmers_phone_unique ON farmers (phone);`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS otp_store (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(15) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS market_prices (
        id SERIAL PRIMARY KEY,
        commodity VARCHAR(120) NOT NULL,
        variety VARCHAR(120) NOT NULL DEFAULT '',
        market VARCHAR(160) NOT NULL,
        state VARCHAR(80) NOT NULL,
        district VARCHAR(120) NOT NULL DEFAULT '',
        arrival_date DATE NOT NULL,
        min_price FLOAT,
        max_price FLOAT,
        modal_price FLOAT,
        source VARCHAR(80) DEFAULT 'Government OGD / AGMARKNET',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (commodity, variety, market, state, district, arrival_date)
      );
    `);
    await pool.query(`ALTER TABLE market_prices ADD COLUMN IF NOT EXISTS grade VARCHAR(80) DEFAULT '';`);
    await pool.query(`CREATE INDEX IF NOT EXISTS market_prices_commodity_idx ON market_prices (commodity);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS market_prices_state_idx ON market_prices (state);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS market_prices_district_idx ON market_prices (district);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS market_prices_market_idx ON market_prices (market);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS market_prices_arrival_date_idx ON market_prices (arrival_date);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS market_prices_lookup_idx ON market_prices (commodity, state, arrival_date);`);

    console.log("Database tables initialized successfully.");

    const telemetryStore = require('./services/telemetry/telemetryStore');
    await telemetryStore.initTelemetrySchema();
    const espStore = require('./services/telemetry/espStore');
    await espStore.initEspSchema();
  } catch (error) {
    console.error("Error initializing database tables:", error);
  }
};

module.exports = {
  pool,
  initDB,
  poolConfigFromUrl,
};
