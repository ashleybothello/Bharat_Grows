/**
 * Telemetry persistence — schema, writes and range queries.
 *
 * All simulated sensor data lives here. This is the single source of truth that
 * the Dashboard, Map, History, Analyze and Results pages all read from.
 *
 * SCALE
 * One node at a 10-second interval is 315,360 rows a year; twelve nodes is
 * ~3.8M. Raw rows are never deleted, so every read path is either bounded by a
 * LIMIT with pagination or aggregated in SQL. Nothing in this module returns an
 * unbounded result set.
 *
 * AGGREGATION
 * Graph queries bucket rows by flooring the row's epoch seconds to a bucket
 * width and averaging inside each bucket, which keeps a 1-year chart at ~365
 * points instead of 3.1M. The raw rows behind a bucket stay on disk and remain
 * reachable through the paginated history endpoint.
 */

const { pool } = require('../../db');
const { SENSOR_KEYS } = require('./sensorSpec');

/** Numeric sensor columns in a fixed order, used for inserts and aggregation. */
const READING_COLUMNS = [
  'nitrogen', 'phosphorus', 'potassium', 'soil_moisture',
  'temperature', 'humidity', 'light', 'rain', 'water_level',
  'flame', 'pir',
];

function dbEnabled() {
  return Boolean(String(process.env.DATABASE_URL || '').trim());
}

/**
 * Create the telemetry schema.
 *
 * Additive only: it never touches farmers, otp_store, soil_data, predictions or
 * market_prices, so OTP auth, the existing history tables and the Government
 * market cache are unaffected.
 */
async function initTelemetrySchema() {
  if (!dbEnabled()) {
    console.log('[telemetry] DATABASE_URL not set — telemetry schema not created.');
    return false;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sensor_nodes (
      id SERIAL PRIMARY KEY,
      node_id VARCHAR(32) NOT NULL,
      node_number INTEGER NOT NULL,
      farmer_id INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
      farm_id VARCHAR(64) NOT NULL,
      farm_name VARCHAR(160) DEFAULT '',
      zone VARCHAR(32) NOT NULL DEFAULT '',
      position_x DOUBLE PRECISION,
      position_y DOUBLE PRECISION,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      covers_sq_metres INTEGER NOT NULL DEFAULT 500,
      status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
      health VARCHAR(24),
      last_seen TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (farmer_id, node_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sensor_telemetry (
      id BIGSERIAL PRIMARY KEY,
      node_id VARCHAR(32) NOT NULL,
      farmer_id INTEGER NOT NULL,
      farm_id VARCHAR(64) NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      source VARCHAR(24) NOT NULL DEFAULT 'SIMULATED'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sensor_anomalies (
      id BIGSERIAL PRIMARY KEY,
      node_id VARCHAR(32) NOT NULL,
      farmer_id INTEGER NOT NULL,
      farm_id VARCHAR(64) NOT NULL,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sensor VARCHAR(32) NOT NULL,
      value DOUBLE PRECISION,
      severity VARCHAR(24) NOT NULL,
      message TEXT,
      trigger VARCHAR(24) NOT NULL DEFAULT 'SIMULATION',
      email_sent BOOLEAN NOT NULL DEFAULT FALSE,
      sms_sent BOOLEAN NOT NULL DEFAULT FALSE,
      email_error TEXT,
      sms_error TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Every read path filters by node or farmer and orders by time, so these
  // composite indexes cover the range scans and keep queries off sequential scans.
  await pool.query(`CREATE INDEX IF NOT EXISTS telemetry_node_time_idx ON sensor_telemetry (node_id, recorded_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS telemetry_farmer_time_idx ON sensor_telemetry (farmer_id, recorded_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS telemetry_farm_time_idx ON sensor_telemetry (farm_id, recorded_at DESC);`);
  // BRIN suits an append-only, time-ordered column and costs far less to
  // maintain than a btree across millions of rows.
  await pool.query(`CREATE INDEX IF NOT EXISTS telemetry_time_brin_idx ON sensor_telemetry USING BRIN (recorded_at);`);

  await pool.query(`CREATE INDEX IF NOT EXISTS anomalies_farmer_time_idx ON sensor_anomalies (farmer_id, detected_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS anomalies_node_time_idx ON sensor_anomalies (node_id, detected_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS anomalies_severity_idx ON sensor_anomalies (severity);`);

  await pool.query(`CREATE INDEX IF NOT EXISTS nodes_farmer_idx ON sensor_nodes (farmer_id);`);

  console.log('[telemetry] schema ready (sensor_nodes, sensor_telemetry, sensor_anomalies).');
  return true;
}

/** Register or refresh a farm's nodes. Idempotent on (farmer_id, node_id). */
async function upsertNodes(farmerId, farmId, farmName, nodes) {
  if (!dbEnabled() || !nodes.length) return [];

  const rows = [];
  for (const node of nodes) {
    const result = await pool.query(
      `INSERT INTO sensor_nodes
         (node_id, node_number, farmer_id, farm_id, farm_name, zone,
          position_x, position_y, latitude, longitude, covers_sq_metres)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (farmer_id, node_id) DO UPDATE SET
         node_number = EXCLUDED.node_number,
         farm_id = EXCLUDED.farm_id,
         farm_name = EXCLUDED.farm_name,
         zone = EXCLUDED.zone,
         position_x = EXCLUDED.position_x,
         position_y = EXCLUDED.position_y,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         covers_sq_metres = EXCLUDED.covers_sq_metres
       RETURNING *;`,
      [
        node.nodeId, node.nodeNumber, farmerId, farmId, farmName || '', node.zone,
        node.positionX, node.positionY, node.latitude, node.longitude, node.coversSqMetres,
      ]
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

/** All nodes for one farmer. */
async function listNodes(farmerId) {
  if (!dbEnabled()) return [];
  const { rows } = await pool.query(
    `SELECT * FROM sensor_nodes WHERE farmer_id = $1 ORDER BY node_number ASC;`,
    [farmerId]
  );
  return rows;
}

async function findNode(farmerId, nodeId) {
  if (!dbEnabled()) return null;
  const { rows } = await pool.query(
    `SELECT * FROM sensor_nodes WHERE farmer_id = $1 AND node_id = $2;`,
    [farmerId, nodeId]
  );
  return rows[0] || null;
}

/**
 * Write one tick's readings for every node in a single statement.
 *
 * A multi-row INSERT keeps one round trip per tick instead of one per node,
 * which is what makes a 10-second cadence affordable as node counts grow.
 */
async function insertReadings(readings) {
  if (!dbEnabled() || !readings.length) return 0;

  const cols = ['node_id', 'farmer_id', 'farm_id', 'recorded_at', ...READING_COLUMNS, 'health', 'source'];
  const values = [];
  const tuples = [];

  readings.forEach((reading, rowIndex) => {
    const placeholders = cols.map((_, colIndex) => `$${rowIndex * cols.length + colIndex + 1}`);
    tuples.push(`(${placeholders.join(',')})`);
    values.push(
      reading.nodeId,
      reading.farmerId,
      reading.farmId,
      reading.recordedAt,
      ...READING_COLUMNS.map((c) => (reading[c] === undefined ? null : reading[c])),
      reading.health,
      reading.source || 'SIMULATED'
    );
  });

  await pool.query(
    `INSERT INTO sensor_telemetry (${cols.join(',')}) VALUES ${tuples.join(',')};`,
    values
  );

  // Keep the node row's cached health in step with its newest reading.
  for (const reading of readings) {
    await pool.query(
      `UPDATE sensor_nodes SET health = $1, last_seen = $2
       WHERE farmer_id = $3 AND node_id = $4;`,
      [reading.health, reading.recordedAt, reading.farmerId, reading.nodeId]
    );
  }

  return readings.length;
}

/** Newest reading per node for one farmer, via a lateral join on the node list. */
async function latestPerNode(farmerId) {
  if (!dbEnabled()) return [];
  const { rows } = await pool.query(
    `SELECT n.node_id, n.node_number, n.zone, n.position_x, n.position_y,
            n.latitude, n.longitude, n.covers_sq_metres, n.farm_id, n.farm_name,
            n.status, t.*
     FROM sensor_nodes n
     LEFT JOIN LATERAL (
       SELECT ${READING_COLUMNS.join(',')}, recorded_at, health AS reading_health, source
       FROM sensor_telemetry
       WHERE node_id = n.node_id AND farmer_id = n.farmer_id
       ORDER BY recorded_at DESC
       LIMIT 1
     ) t ON TRUE
     WHERE n.farmer_id = $1
     ORDER BY n.node_number ASC;`,
    [farmerId]
  );
  return rows;
}

async function latestForNode(farmerId, nodeId) {
  if (!dbEnabled()) return null;
  const { rows } = await pool.query(
    `SELECT * FROM sensor_telemetry
     WHERE farmer_id = $1 AND node_id = $2
     ORDER BY recorded_at DESC LIMIT 1;`,
    [farmerId, nodeId]
  );
  return rows[0] || null;
}

/**
 * Bucket width per graph range.
 *
 * Chosen so each chart lands in the low hundreds of points regardless of how
 * much raw data sits underneath.
 *   1d  -> 5 min buckets  (~288 points)
 *   1w  -> 1 hour         (~168)
 *   1m  -> 6 hours        (~120)
 *   1y  -> 1 day          (~365)
 */
const RANGE_CONFIG = {
  '1d': { interval: '1 day', bucketSeconds: 300, label: '5-minute average' },
  '1w': { interval: '7 days', bucketSeconds: 3600, label: 'hourly average' },
  '1m': { interval: '30 days', bucketSeconds: 21600, label: '6-hour average' },
  '1y': { interval: '365 days', bucketSeconds: 86400, label: 'daily average' },
};

function rangeConfig(range) {
  return RANGE_CONFIG[String(range || '1d').toLowerCase()] || RANGE_CONFIG['1d'];
}

/**
 * Aggregated series for one sensor.
 *
 * Averages inside each bucket and also returns min/max so a chart can show the
 * spread that averaging hides. Raw rows are untouched.
 *
 * `nodeId` null aggregates across every node the farmer owns.
 */
async function sensorSeries({ farmerId, nodeId = null, sensor, range = '1d' }) {
  if (!dbEnabled()) return { points: [], aggregation: null };
  if (!READING_COLUMNS.includes(sensor)) {
    throw new Error(`Unknown sensor column: ${sensor}`);
  }

  const cfg = rangeConfig(range);
  const params = [farmerId, cfg.bucketSeconds];
  let nodeFilter = '';
  if (nodeId) {
    params.push(nodeId);
    nodeFilter = `AND node_id = $${params.length}`;
  }

  // The sensor name is validated against READING_COLUMNS above, so this
  // interpolation cannot carry caller-controlled SQL.
  const { rows } = await pool.query(
    `SELECT to_timestamp(floor(extract(epoch FROM recorded_at) / $2) * $2) AS bucket,
            AVG(${sensor})::numeric(12,2) AS avg_value,
            MIN(${sensor})::numeric(12,2) AS min_value,
            MAX(${sensor})::numeric(12,2) AS max_value,
            COUNT(*) AS samples
     FROM sensor_telemetry
     WHERE farmer_id = $1
       AND recorded_at >= NOW() - INTERVAL '${cfg.interval}'
       ${nodeFilter}
     GROUP BY bucket
     ORDER BY bucket ASC;`,
    params
  );

  return {
    points: rows.map((r) => ({
      t: r.bucket,
      value: r.avg_value === null ? null : Number(r.avg_value),
      min: r.min_value === null ? null : Number(r.min_value),
      max: r.max_value === null ? null : Number(r.max_value),
      samples: Number(r.samples),
    })),
    aggregation: {
      range: String(range).toLowerCase(),
      window: cfg.interval,
      bucketSeconds: cfg.bucketSeconds,
      method: cfg.label,
      note: 'Bucketed average of persisted readings. Raw readings are retained and available through the history endpoint.',
    },
  };
}

/** Paginated raw readings. Always bounded by `limit`. */
async function readingHistory({ farmerId, nodeId = null, limit = 50, offset = 0, range = null }) {
  if (!dbEnabled()) return { rows: [], total: 0 };

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const filters = ['farmer_id = $1'];
  const params = [farmerId];
  if (nodeId) {
    params.push(nodeId);
    filters.push(`node_id = $${params.length}`);
  }
  if (range && RANGE_CONFIG[String(range).toLowerCase()]) {
    filters.push(`recorded_at >= NOW() - INTERVAL '${rangeConfig(range).interval}'`);
  }

  const where = filters.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::bigint AS total FROM sensor_telemetry WHERE ${where};`,
    params
  );

  const { rows } = await pool.query(
    `SELECT t.*, n.node_number, n.zone
     FROM sensor_telemetry t
     LEFT JOIN sensor_nodes n ON n.farmer_id = t.farmer_id AND n.node_id = t.node_id
     WHERE ${where
       .replaceAll('farmer_id', 't.farmer_id')
       .replaceAll('node_id', 't.node_id')
       .replaceAll('recorded_at', 't.recorded_at')}
     ORDER BY t.recorded_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset};`,
    params
  );

  return { rows, total: Number(countResult.rows[0].total), limit: safeLimit, offset: safeOffset };
}

async function insertAnomaly(anomaly) {
  if (!dbEnabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO sensor_anomalies
       (node_id, farmer_id, farm_id, detected_at, sensor, value, severity, message, trigger)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *;`,
    [
      anomaly.nodeId, anomaly.farmerId, anomaly.farmId, anomaly.detectedAt,
      anomaly.sensor, anomaly.value, anomaly.severity, anomaly.message,
      anomaly.trigger || 'SIMULATION',
    ]
  );
  return rows[0];
}

async function markAnomalyDispatch(id, { emailSent, smsSent, emailError, smsError }) {
  if (!dbEnabled()) return null;
  const { rows } = await pool.query(
    `UPDATE sensor_anomalies
     SET email_sent = $2, sms_sent = $3, email_error = $4, sms_error = $5
     WHERE id = $1 RETURNING *;`,
    [id, Boolean(emailSent), Boolean(smsSent), emailError || null, smsError || null]
  );
  return rows[0] || null;
}

async function resolveOpenAnomalies(farmerId, nodeId, sensor, resolvedAt) {
  if (!dbEnabled()) return 0;
  const { rowCount } = await pool.query(
    `UPDATE sensor_anomalies SET resolved_at = $4
     WHERE farmer_id = $1 AND node_id = $2 AND sensor = $3 AND resolved_at IS NULL;`,
    [farmerId, nodeId, sensor, resolvedAt]
  );
  return rowCount;
}

/** Paginated anomaly history, newest first. */
async function anomalyHistory({ farmerId, nodeId = null, severity = null, limit = 50, offset = 0 }) {
  if (!dbEnabled()) return { rows: [], total: 0 };

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const filters = ['farmer_id = $1'];
  const params = [farmerId];
  if (nodeId) {
    params.push(nodeId);
    filters.push(`node_id = $${params.length}`);
  }
  if (severity) {
    params.push(String(severity).toUpperCase());
    filters.push(`severity = $${params.length}`);
  }

  const where = filters.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::bigint AS total FROM sensor_anomalies WHERE ${where};`,
    params
  );
  const { rows } = await pool.query(
    `SELECT a.*, n.node_number, n.zone
     FROM sensor_anomalies a
     LEFT JOIN sensor_nodes n ON n.farmer_id = a.farmer_id AND n.node_id = a.node_id
     WHERE ${where
       .replaceAll('farmer_id', 'a.farmer_id')
       .replaceAll('node_id', 'a.node_id')
       .replaceAll('severity', 'a.severity')}
     ORDER BY a.detected_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset};`,
    params
  );

  return { rows, total: Number(countResult.rows[0].total), limit: safeLimit, offset: safeOffset };
}

async function anomalyCountForNode(farmerId, nodeId) {
  if (!dbEnabled()) return { total: 0, latest: null };
  const { rows } = await pool.query(
    `SELECT COUNT(*)::bigint AS total, MAX(detected_at) AS latest
     FROM sensor_anomalies WHERE farmer_id = $1 AND node_id = $2;`,
    [farmerId, nodeId]
  );
  return { total: Number(rows[0].total), latest: rows[0].latest };
}

/** Farmers that have at least one provisioned node, for the simulation loop. */
async function farmersWithNodes() {
  if (!dbEnabled()) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT farmer_id FROM sensor_nodes WHERE status = 'ACTIVE';`
  );
  return rows.map((r) => r.farmer_id);
}

module.exports = {
  READING_COLUMNS,
  RANGE_CONFIG,
  SENSOR_KEYS,
  dbEnabled,
  initTelemetrySchema,
  upsertNodes,
  listNodes,
  findNode,
  insertReadings,
  latestPerNode,
  latestForNode,
  sensorSeries,
  readingHistory,
  insertAnomaly,
  markAnomalyDispatch,
  resolveOpenAnomalies,
  anomalyHistory,
  anomalyCountForNode,
  farmersWithNodes,
  rangeConfig,
};
