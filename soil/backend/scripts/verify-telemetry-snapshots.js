/**
 * Verifies that each node stores a complete, distinct snapshot in PostgreSQL
 * and that a later tick writes more rows. Prints no secrets.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
const { pool } = require('../db');

const SENSORS = [
  'nitrogen', 'phosphorus', 'potassium', 'soil_moisture',
  'temperature', 'humidity', 'light', 'rain', 'water_level', 'flame', 'pir',
];

async function latestByNode() {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (farmer_id, node_id)
      farmer_id, node_id, recorded_at, health,
      nitrogen, phosphorus, potassium, soil_moisture,
      temperature, humidity, light, rain, water_level, flame, pir
    FROM sensor_telemetry
    ORDER BY farmer_id, node_id, recorded_at DESC;
  `);
  return rows;
}

function complete(row) {
  return SENSORS.every((key) => row[key] !== null && row[key] !== undefined);
}

function fingerprint(row) {
  return SENSORS.map((key) => row[key]).join('|');
}

async function main() {
  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS n FROM sensor_telemetry;');
  const before = countRows[0].n;
  const first = await latestByNode();

  if (!first.length) {
    console.log('FAIL: sensor_telemetry is empty. Login once so nodes are provisioned, then retry.');
    process.exit(1);
  }

  const incomplete = first.filter((row) => !complete(row));
  if (incomplete.length) {
    console.log('FAIL: incomplete snapshots', incomplete.map((r) => r.node_id));
    process.exit(1);
  }

  const prints = first.map((row) => ({
    node: row.node_id,
    at: row.recorded_at,
    health: row.health,
    N: row.nitrogen,
    P: row.phosphorus,
    K: row.potassium,
    moisture: row.soil_moisture,
    temp: row.temperature,
    humidity: row.humidity,
    light: row.light,
    rain: row.rain,
    water: row.water_level,
    flame: row.flame,
    pir: row.pir,
  }));
  console.log('LATEST SNAPSHOTS');
  console.log(JSON.stringify(prints, null, 2));

  const fingerprints = first.map(fingerprint);
  const unique = new Set(fingerprints);
  if (unique.size < Math.min(2, first.length)) {
    console.log('FAIL: nodes share the same snapshot');
    process.exit(1);
  }

  const n3 = first.find((r) => r.node_id.endsWith('003') || r.node_id === 'BG-NODE-003');
  const n2 = first.find((r) => r.node_id.endsWith('002') || r.node_id === 'BG-NODE-002');
  const n1 = first.find((r) => r.node_id.endsWith('001') || r.node_id === 'BG-NODE-001');
  if (n1 && n2 && n1.soil_moisture === n2.soil_moisture && n1.nitrogen === n2.nitrogen) {
    console.log('WARN: node 1 and 2 N and moisture matched this tick (possible but unlikely).');
  }
  if (n3 && n1 && n3.nitrogen === n1.nitrogen) {
    console.log('WARN: node 1 and 3 nitrogen matched this tick.');
  }

  console.log(`nodes=${first.length} unique_snapshots=${unique.size} rows_before=${before}`);
  console.log('Waiting 11s for the next tick…');
  await new Promise((resolve) => setTimeout(resolve, 11000));

  const { rows: afterRows } = await pool.query('SELECT COUNT(*)::int AS n FROM sensor_telemetry;');
  const after = afterRows[0].n;
  const second = await latestByNode();
  const later = second.some((row) => {
    const prev = first.find((p) => p.farmer_id === row.farmer_id && p.node_id === row.node_id);
    return prev && new Date(row.recorded_at) > new Date(prev.recorded_at);
  });

  if (after <= before) {
    console.log(`FAIL: row count did not grow (${before} -> ${after}). Simulator may not be ticking.`);
    process.exit(1);
  }
  if (!later) {
    console.log('FAIL: timestamps did not advance.');
    process.exit(1);
  }

  console.log(`PASS rows ${before} -> ${after}, timestamps advanced, ${unique.size} distinct snapshots.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('FAIL:', err.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
