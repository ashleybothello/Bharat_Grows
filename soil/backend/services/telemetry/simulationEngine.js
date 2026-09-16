/**
 * Sensor simulation engine — the only producer of telemetry in BharatGrow.
 *
 * ONE SCHEDULER
 * A single setInterval lives in this module and is guarded twice: a
 * module-level handle stops a second interval inside one process, and a
 * PostgreSQL advisory lock stops a second *instance* (a stale nodemon child, a
 * second dyno) from writing the same rows. Nothing is generated in React.
 *
 * REALISTIC VALUES
 * Each sensor is an Ornstein-Uhlenbeck style mean-reverting walk: the next
 * reading is the previous one nudged toward the node's baseline plus a small
 * random step. Consecutive readings therefore move like 27.1, 27.3, 27.2, 27.6
 * rather than jumping across the whole range. Temperature, humidity and light
 * additionally follow a daily curve.
 *
 * SPATIAL CORRELATION
 * Baselines are a smooth function of the node's normalised grid position plus a
 * small per-node offset derived from a hash of its node_id. Neighbouring nodes
 * therefore read similarly while no two nodes are identical, and the layout is
 * reproducible across restarts.
 *
 * CONTINUITY
 * On startup each node's walk resumes from its newest persisted reading, so a
 * backend restart does not produce a visible discontinuity in the graphs.
 *
 * A NOTE ON LIGHT
 * Real darkness is ~0 lux, which the spec grades CRITICAL (<100). Simulating a
 * true night would therefore fire a critical alert for every node every
 * evening. Light is modelled as a canopy sensor whose daily curve stays inside
 * the healthy band, so darkness never manufactures a spurious CRITICAL. Light
 * still reaches AVERAGE/BAD/CRITICAL through anomalies.
 */

const { pool } = require('../../db');
const store = require('./telemetryStore');
const { evaluateReading, SENSORS } = require('./sensorSpec');
const { buildNodeLayout } = require('./nodeProvisioner');
const anomalyService = require('./anomalyService');

const DEFAULT_INTERVAL_MS = 10000;
// Arbitrary but fixed key; any other instance asking for the same key fails fast.
const ADVISORY_LOCK_KEY = 728341;

let timer = null;
let holdsLock = false;
let running = false;
let tickInFlight = false;

/** In-memory walk state, keyed `${farmerId}:${nodeId}`. */
const nodeStates = new Map();

/** Manually or spontaneously injected anomalies, keyed the same way. */
const activeAnomalies = new Map();

const stats = {
  startedAt: null,
  ticks: 0,
  readingsWritten: 0,
  lastTickAt: null,
  lastError: null,
};

// ─────────────────────────────── helpers ───────────────────────────────

/** Deterministic 32-bit hash of a string. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, decimals) => Number(v.toFixed(decimals));

function intervalMs() {
  const raw = Number(process.env.SIM_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 1000) return Math.floor(raw);
  return DEFAULT_INTERVAL_MS;
}

/** Fraction of the day, 0 at midnight, 0.5 at noon. */
function dayFraction(now) {
  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  return mins / 1440;
}

/** Smooth 0..1 daylight curve peaking at ~13:00. */
function daylight(now) {
  const phase = (dayFraction(now) - 0.54) * 2 * Math.PI;
  return clamp((Math.cos(phase) + 1) / 2, 0, 1);
}

/**
 * Each node has its own field personality so snapshots are never copies of
 * one another. Healthy nodes sit in GOOD. A few nodes sit slightly off so the
 * map can show yellow from real values, not decoration.
 *
 *   1, 4, 7…  healthy
 *   2, 10…    slightly dry          (moisture AVERAGE)
 *   3, 11…    nitrogen deficient    (N AVERAGE)
 *   5…        a little warm         (temp AVERAGE)
 *   6…        potassium a little low
 *   8…        a little humid
 */
function personalityFor(nodeNumber) {
  switch (((Number(nodeNumber) || 1) - 1) % 8) {
    case 1: return { key: 'dry', soil_moisture: 48 };
    case 2: return { key: 'n_deficient', nitrogen: 32 };
    case 4: return { key: 'warm', temperature: 32.4 };
    case 5: return { key: 'low_k', potassium: 32 };
    case 7: return { key: 'humid', humidity: 83 };
    default: return { key: 'healthy' };
  }
}

/**
 * Per-node baselines. Spatial gradient + hash keep neighbours similar but
 * never identical; personality then pulls the node's characteristic sensor.
 */
function baselinesFor(node) {
  const h = hash(node.node_id || node.nodeId || '');
  const h2 = hash(`${node.node_id || node.nodeId}-alt`);
  const x = Number(node.position_x ?? node.positionX ?? 0.5);
  const y = Number(node.position_y ?? node.positionY ?? 0.5);
  const personality = personalityFor(node.node_number || node.nodeNumber);

  const gradA = Math.sin((x + y) * Math.PI);
  const gradB = Math.cos(x * Math.PI) * Math.sin(y * Math.PI);

  const base = {
    nitrogen: clamp(58 + gradA * 8 + (h - 0.5) * 10, 42, 76),
    phosphorus: clamp(33 + gradB * 6 + (h2 - 0.5) * 8, 22, 47),
    potassium: clamp(68 + gradA * 12 + (h - 0.5) * 14, 45, 95),
    soil_moisture: clamp(66 + gradB * 7 + (h2 - 0.5) * 8, 57, 78),
    temperature: clamp(26 + gradA * 1.6 + (h - 0.5) * 2.4, 22.5, 28.5),
    humidity: clamp(64 + gradB * 6 + (h2 - 0.5) * 8, 53, 77),
    light: clamp(950 + gradA * 180 + (h - 0.5) * 220, 620, 1350),
    water_level: clamp(82 + gradB * 8 + (h2 - 0.5) * 10, 72, 95),
    rain: 0,
  };

  for (const key of ['nitrogen', 'phosphorus', 'potassium', 'soil_moisture', 'temperature', 'humidity']) {
    if (Number.isFinite(personality[key])) base[key] = personality[key];
  }
  base.personality = personality.key;
  return base;
}

/**
 * Mean-reverting step.
 * `pull` is how strongly the value returns to baseline, `noise` the random
 * jitter per tick. Both are small so the series stays smooth.
 */
function walk(current, baseline, pull, noise, lo, hi) {
  const next = current + (baseline - current) * pull + (Math.random() - 0.5) * 2 * noise;
  return clamp(next, lo, hi);
}

async function initState(node) {
  const key = `${node.farmer_id}:${node.node_id}`;
  const baselines = baselinesFor(node);

  // Resume from the newest persisted reading so restarts stay continuous.
  let current = null;
  try {
    const last = await store.latestForNode(node.farmer_id, node.node_id);
    if (last) {
      current = {
        nitrogen: Number(last.nitrogen),
        phosphorus: Number(last.phosphorus),
        potassium: Number(last.potassium),
        soil_moisture: Number(last.soil_moisture),
        temperature: Number(last.temperature),
        humidity: Number(last.humidity),
        light: Number(last.light),
        water_level: Number(last.water_level),
      };
    }
  } catch {
    current = null;
  }

  const personality = personalityFor(node.node_number || node.nodeNumber);
  const fromDb = current;
  const seeded = fromDb || {
    nitrogen: baselines.nitrogen,
    phosphorus: baselines.phosphorus,
    potassium: baselines.potassium,
    soil_moisture: baselines.soil_moisture,
    temperature: baselines.temperature,
    humidity: baselines.humidity,
    light: baselines.light,
    water_level: baselines.water_level,
  };

  for (const key of ['nitrogen', 'phosphorus', 'potassium', 'soil_moisture', 'temperature', 'humidity']) {
    if (Number.isFinite(personality[key])) seeded[key] = personality[key];
  }

  const state = {
    key,
    baselines,
    current: seeded,
    // Rain arrives in multi-tick spells rather than as isolated spikes.
    rainSpellTicks: 0,
    rainIntensity: 0,
  };

  nodeStates.set(key, state);
  return state;
}

// ─────────────────────────── reading generation ───────────────────────────

/**
 * Produce one complete snapshot for one node.
 *
 * Bounds allow GOOD, AVERAGE and BAD. They stop just short of CRITICAL so a
 * red node is almost always an injected anomaly, not a random spike.
 */
function generateReading(node, state, now) {
  const b = state.baselines;
  const c = state.current;
  const sun = daylight(now);
  const personality = b.personality || 'healthy';
  const pull = personality === 'healthy' ? 0.12 : 0.22;

  const tempTarget = personality === 'warm'
    ? b.temperature
    : b.temperature + (sun - 0.5) * 5.5;
  c.temperature = walk(c.temperature, tempTarget, pull, 0.22, 12, 38);

  const humTarget = personality === 'humid'
    ? b.humidity
    : b.humidity - (sun - 0.5) * 12;
  c.humidity = walk(c.humidity, humTarget, pull, 0.8, 22, 93);

  const lightTarget = 560 + sun * (b.light - 560) * 1.35;
  c.light = walk(c.light, clamp(lightTarget, 520, 1460), 0.18, 22, 510, 1480);

  let rain = 0;
  if (state.rainSpellTicks > 0) {
    state.rainSpellTicks -= 1;
    rain = Math.max(0, state.rainIntensity + (Math.random() - 0.5) * 0.8);
  } else if (Math.random() < 0.004) {
    state.rainSpellTicks = 6 + Math.floor(Math.random() * 30);
    state.rainIntensity = 0.5 + Math.random() * 6;
    rain = state.rainIntensity;
  }

  const moistureTarget = b.soil_moisture + (rain > 0 ? 6 : 0) - (personality === 'dry' ? 0 : sun * 2.5);
  c.soil_moisture = walk(c.soil_moisture, moistureTarget, personality === 'dry' ? 0.2 : 0.05, 0.45, 22, 93);

  const waterTarget = rain > 0 ? Math.min(98, b.water_level + 5) : b.water_level;
  c.water_level = walk(c.water_level, waterTarget, 0.03, 0.35, 32, 97);

  c.nitrogen = walk(c.nitrogen, b.nitrogen, personality === 'n_deficient' ? 0.22 : 0.04, 0.45, 12, 115);
  c.phosphorus = walk(c.phosphorus, b.phosphorus, 0.04, 0.2, 6, 85);
  c.potassium = walk(c.potassium, b.potassium, personality === 'low_k' ? 0.22 : 0.04, 0.4, 12, 190);

  const reading = {
    nitrogen: round(c.nitrogen, 0),
    phosphorus: round(c.phosphorus, 0),
    potassium: round(c.potassium, 0),
    soil_moisture: round(c.soil_moisture, 0),
    temperature: round(c.temperature, 1),
    humidity: round(c.humidity, 0),
    light: round(c.light, 0),
    rain: round(rain, 1),
    water_level: round(c.water_level, 0),
    flame: 0,
    pir: Math.random() < 0.03 ? 1 : 0,
  };

  return applyAnomaly(state.key, reading, now);
}

/**
 * Overlay an active anomaly.
 *
 * An anomaly pins one sensor to a target value for a number of ticks. Held
 * rather than applied once, so the farmer has time to see it on the map and so
 * the CRITICAL state persists long enough to prove alerts are not re-sent.
 */
function applyAnomaly(key, reading, now) {
  const anomaly = activeAnomalies.get(key);
  if (!anomaly) return reading;

  if (anomaly.ticksRemaining <= 0 || (anomaly.expiresAt && anomaly.expiresAt <= now)) {
    activeAnomalies.delete(key);
    return reading;
  }

  anomaly.ticksRemaining -= 1;

  const spec = SENSORS[anomaly.sensor];
  const decimals = spec ? spec.decimals : 1;
  // Small jitter around the target keeps the anomalous series looking measured
  // rather than pasted in, without leaving the intended status band.
  const jitter = anomaly.sensor === 'flame' || anomaly.sensor === 'pir'
    ? 0
    : (Math.random() - 0.5) * anomaly.jitter;

  reading[anomaly.sensor] = round(anomaly.value + jitter, decimals);
  return reading;
}

/** How far a value may wander while an anomaly holds it. */
function jitterFor(sensor) {
  switch (sensor) {
    case 'temperature': return 0.4;
    case 'light': return 30;
    case 'nitrogen':
    case 'phosphorus': return 0.8;
    case 'potassium': return 1.4;
    default: return 1.0;
  }
}

/**
 * Register an anomaly on a node.
 * Used by the demo button and by the occasional spontaneous anomaly.
 */
function injectAnomaly({ farmerId, nodeId, sensor, value, ticks = 60 }) {
  const key = `${farmerId}:${nodeId}`;
  activeAnomalies.set(key, {
    sensor,
    value: Number(value),
    ticksRemaining: Math.max(1, Number(ticks) || 60),
    jitter: jitterFor(sensor),
    startedAt: new Date(),
  });
  return { farmerId, nodeId, sensor, value: Number(value), ticks };
}

/** Clear an anomaly so the node walks back to its baseline. */
function clearAnomaly({ farmerId, nodeId }) {
  return activeAnomalies.delete(`${farmerId}:${nodeId}`);
}

function activeAnomalyFor(farmerId, nodeId) {
  return activeAnomalies.get(`${farmerId}:${nodeId}`) || null;
}

/**
 * Occasionally push a random node into an abnormal band.
 *
 * Deliberately rare and weighted toward AVERAGE/BAD so the demo is not drowned
 * in critical alerts. Disable with SIM_SPONTANEOUS_ANOMALIES=false.
 */
function maybeSpontaneousAnomaly(nodes) {
  if (String(process.env.SIM_SPONTANEOUS_ANOMALIES || 'true').toLowerCase() === 'false') return;
  if (!nodes.length) return;
  if (Math.random() > Number(process.env.SIM_ANOMALY_CHANCE || 0.01)) return;

  const node = nodes[Math.floor(Math.random() * nodes.length)];
  const key = `${node.farmer_id}:${node.node_id}`;
  if (activeAnomalies.has(key)) return;

  // AVERAGE and BAD are far likelier than CRITICAL.
  const candidates = [
    { sensor: 'soil_moisture', value: 46, weight: 5 },   // AVERAGE
    { sensor: 'temperature', value: 32.5, weight: 5 },   // AVERAGE
    { sensor: 'humidity', value: 42, weight: 4 },        // AVERAGE
    { sensor: 'nitrogen', value: 28, weight: 4 },        // AVERAGE
    { sensor: 'soil_moisture', value: 33, weight: 3 },   // BAD
    { sensor: 'potassium', value: 165, weight: 2 },      // BAD
    { sensor: 'water_level', value: 38, weight: 2 },     // BAD
    { sensor: 'nitrogen', value: 8, weight: 1 },         // CRITICAL
    { sensor: 'water_level', value: 24, weight: 1 },     // CRITICAL
  ];

  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let pick = Math.random() * total;
  const chosen = candidates.find((c) => (pick -= c.weight) <= 0) || candidates[0];

  injectAnomaly({
    farmerId: node.farmer_id,
    nodeId: node.node_id,
    sensor: chosen.sensor,
    value: chosen.value,
    ticks: 30 + Math.floor(Math.random() * 60),
  });
}

// ──────────────────────────────── the tick ────────────────────────────────

/**
 * One simulation tick: generate a reading per active node, persist them in a
 * single batch, then hand them to anomaly detection.
 */
async function tick() {
  if (tickInFlight) return; // A slow database must not overlap ticks.
  tickInFlight = true;

  try {
    const farmerIds = await store.farmersWithNodes();
    if (!farmerIds.length) return;

    const now = new Date();
    const batch = [];
    const evaluated = [];

    for (const farmerId of farmerIds) {
      const nodes = await store.listNodes(farmerId);
      maybeSpontaneousAnomaly(nodes);

      for (const node of nodes) {
        if (node.status !== 'ACTIVE') continue;

        const key = `${node.farmer_id}:${node.node_id}`;
        const state = nodeStates.get(key) || await initState(node);

        const reading = generateReading(node, state, now);
        const evaluation = evaluateReading(reading);

        batch.push({
          nodeId: node.node_id,
          farmerId: node.farmer_id,
          farmId: node.farm_id,
          recordedAt: now,
          ...reading,
          health: evaluation.health,
          source: 'SIMULATED',
        });

        evaluated.push({ node, reading, evaluation, recordedAt: now });
      }
    }

    if (batch.length) {
      await store.insertReadings(batch);
      stats.readingsWritten += batch.length;
    }

    // Alerts run after persistence so an anomaly is always backed by a stored row.
    await anomalyService.processEvaluations(evaluated);

    stats.ticks += 1;
    stats.lastTickAt = now;
    stats.lastError = null;
  } catch (err) {
    stats.lastError = err.message;
    console.error('[simulation] tick failed:', err.message);
  } finally {
    tickInFlight = false;
  }
}

// ───────────────────────────── lifecycle ─────────────────────────────

/**
 * Take a PostgreSQL advisory lock so only one backend instance simulates.
 * The lock is held for the life of the connection and released on shutdown.
 */
async function acquireLock() {
  if (!store.dbEnabled()) return false;
  try {
    const { rows } = await pool.query('SELECT pg_try_advisory_lock($1) AS locked;', [ADVISORY_LOCK_KEY]);
    return Boolean(rows[0].locked);
  } catch (err) {
    console.error('[simulation] could not acquire advisory lock:', err.message);
    return false;
  }
}

/**
 * Provision a farmer's nodes from their profile.
 * Idempotent, so it is safe to call on every login.
 */
async function ensureNodesForFarmer(farmer) {
  if (!store.dbEnabled() || !farmer?.id) return { plan: null, nodes: [] };

  const profile = farmer.profile || {};
  const { plan, nodes } = buildNodeLayout(profile);
  if (!nodes.length) return { plan, nodes: [] };

  const farmId = `FARM-${farmer.id}`;
  const farmName = profile.farmName || farmer.name || `Farm ${farmer.id}`;
  await store.upsertNodes(farmer.id, farmId, farmName, nodes);

  return { plan, nodes };
}

async function start() {
  if (running) return { started: false, reason: 'Simulation already running in this process.' };

  if (!store.dbEnabled()) {
    return { started: false, reason: 'DATABASE_URL is not configured; telemetry cannot be persisted.' };
  }
  if (String(process.env.SIM_ENABLED || 'true').toLowerCase() === 'false') {
    return { started: false, reason: 'Disabled via SIM_ENABLED=false.' };
  }

  holdsLock = await acquireLock();
  if (!holdsLock) {
    return { started: false, reason: 'Another backend instance holds the simulation lock.' };
  }

  running = true;
  stats.startedAt = new Date();
  nodeStates.clear();
  timer = setInterval(tick, intervalMs());
  if (timer.unref) timer.unref();

  console.log(`[simulation] started — every ${intervalMs() / 1000}s.`);
  tick(); // Produce a first reading immediately rather than after one interval.

  return { started: true, intervalMs: intervalMs() };
}

async function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;

  if (holdsLock) {
    try {
      await pool.query('SELECT pg_advisory_unlock($1);', [ADVISORY_LOCK_KEY]);
    } catch { /* connection may already be gone during shutdown */ }
    holdsLock = false;
  }
  return { stopped: true };
}

function status() {
  return {
    running,
    holdsLock,
    intervalMs: intervalMs(),
    databaseConfigured: store.dbEnabled(),
    activeAnomalies: activeAnomalies.size,
    trackedNodes: nodeStates.size,
    ...stats,
  };
}

module.exports = {
  start,
  stop,
  status,
  tick,
  ensureNodesForFarmer,
  injectAnomaly,
  clearAnomaly,
  activeAnomalyFor,
  generateReading,
  baselinesFor,
  personalityFor,
  initState,
  nodeStates,
};
