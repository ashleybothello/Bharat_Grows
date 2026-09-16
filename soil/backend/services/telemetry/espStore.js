/**
 * Physical ESP32 persistence — separate from simulated farm-node telemetry.
 *
 * Simulated readings stay in sensor_telemetry (source = SIMULATED).
 * Hardware packets from the two ESP32s are stored here (source = ESP32).
 */

const { pool } = require('../../db');

const COLUMNS = [
  'nitrogen', 'phosphorus', 'potassium', 'soil_moisture',
  'temperature', 'humidity', 'light', 'rain', 'water_level',
  'flame', 'pir',
];

function dbEnabled() {
  return Boolean(String(process.env.DATABASE_URL || '').trim());
}

async function initEspSchema() {
  if (!dbEnabled()) {
    console.log('[esp] DATABASE_URL not set — hardware readings will not be saved.');
    return false;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS esp_telemetry (
      id BIGSERIAL PRIMARY KEY,
      device_id VARCHAR(32) NOT NULL,
      node_id INTEGER,
      packet_at TIMESTAMPTZ NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      nitrogen DOUBLE PRECISION,
      phosphorus DOUBLE PRECISION,
      potassium DOUBLE PRECISION,
      soil_moisture DOUBLE PRECISION,
      temperature DOUBLE PRECISION,
      humidity DOUBLE PRECISION,
      light DOUBLE PRECISION,
      rain DOUBLE PRECISION,
      water_level DOUBLE PRECISION,
      flame SMALLINT,
      pir SMALLINT,
      health VARCHAR(24),
      source VARCHAR(24) NOT NULL DEFAULT 'ESP32',
      UNIQUE (device_id, packet_at)
    );
  `);
  await pool.query(`
    ALTER TABLE esp_telemetry
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS esp_telemetry_device_time_idx
      ON esp_telemetry (device_id, recorded_at DESC);
  `);
  console.log('[esp] schema ready (esp_telemetry).');
  return true;
}

function readingFromRow(row) {
  if (!row) return null;
  const reading = {};
  for (const key of COLUMNS) {
    reading[key] = row[key] === null || row[key] === undefined ? null : Number(row[key]);
  }
  return reading;
}

async function insertPacket(packet) {
  if (!dbEnabled()) return { inserted: false, reason: 'no_db' };

  const result = await pool.query(
    `INSERT INTO esp_telemetry
       (device_id, node_id, packet_at, nitrogen, phosphorus, potassium, soil_moisture,
        temperature, humidity, light, rain, water_level, flame, pir, health, source, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ESP32', NOW())
     ON CONFLICT (device_id, packet_at) DO UPDATE SET last_seen_at = NOW()
     RETURNING id, (xmax = 0) AS inserted;`,
    [
      packet.deviceId,
      packet.nodeId,
      packet.packetAt,
      packet.nitrogen, packet.phosphorus, packet.potassium, packet.soil_moisture,
      packet.temperature, packet.humidity, packet.light, packet.rain,
      packet.water_level, packet.flame, packet.pir, packet.health,
    ]
  );
  return { inserted: Boolean(result.rows[0]?.inserted) };
}

async function latestPerDevice() {
  if (!dbEnabled()) return [];
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (device_id)
      device_id, node_id, packet_at, recorded_at, last_seen_at, health, source,
      ${COLUMNS.join(', ')}
    FROM esp_telemetry
    ORDER BY device_id, packet_at DESC;
  `);
  return rows;
}

async function recentForDevice(deviceId, limit = 60) {
  if (!dbEnabled()) return [];
  const cap = Math.min(Math.max(Number(limit) || 60, 1), 500);
  const { rows } = await pool.query(
    `SELECT device_id, node_id, packet_at, recorded_at, last_seen_at, health, source, ${COLUMNS.join(', ')}
     FROM esp_telemetry
     WHERE device_id = $1
     ORDER BY packet_at DESC
     LIMIT $2;`,
    [String(deviceId), cap]
  );
  return rows;
}

module.exports = {
  COLUMNS,
  dbEnabled,
  initEspSchema,
  insertPacket,
  latestPerDevice,
  recentForDevice,
  readingFromRow,
};
