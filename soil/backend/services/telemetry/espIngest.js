/**
 * Poll the live ESP32 gateway and persist each device separately.
 *
 * The two boards publish through one FastAPI:
 *   GET {ESP_GATEWAY_URL}  ->  { "1": { node_id, nitrogen, ... }, "2": { ... } }
 *
 * Simulated farm nodes are untouched. This ticker only writes esp_telemetry.
 */

const axios = require('axios');
const store = require('./espStore');
const { evaluateReading } = require('./sensorSpec');

const DEFAULT_URL = 'http://10.111.226.121:8000/api/sensor-data';
const DEFAULT_INTERVAL_MS = 5000;

let timer = null;
let tickInFlight = false;
const stats = {
  startedAt: null,
  ticks: 0,
  inserted: 0,
  skipped: 0,
  lastTickAt: null,
  lastError: null,
  lastPayloadAt: {},
};

function gatewayUrl() {
  return String(process.env.ESP_GATEWAY_URL || DEFAULT_URL).trim();
}

function intervalMs() {
  const raw = Number(process.env.ESP_POLL_MS);
  if (Number.isFinite(raw) && raw >= 1000) return Math.floor(raw);
  return DEFAULT_INTERVAL_MS;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDevices(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const rows = Array.isArray(payload) ? payload : Object.values(payload);
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return null;
    const nodeId = Number(row.node_id ?? row.nodeId ?? row.id);
    const deviceId = String(row.device_id || row.deviceId || (Number.isFinite(nodeId) ? nodeId : '')).trim();
    if (!deviceId) return null;
    const packetAt = row.timestamp || row.packet_at || row.recorded_at || new Date().toISOString();
    return {
      deviceId,
      nodeId: Number.isFinite(nodeId) ? nodeId : null,
      packetAt: new Date(packetAt),
      nitrogen: num(row.nitrogen ?? row.n),
      phosphorus: num(row.phosphorus ?? row.p),
      potassium: num(row.potassium ?? row.k),
      soil_moisture: num(row.soil_moisture ?? row.moisture),
      temperature: num(row.temperature),
      humidity: num(row.humidity),
      light: num(row.light),
      rain: num(row.rain),
      water_level: num(row.water_level ?? row.waterLevel),
      flame: num(row.flame),
      pir: num(row.pir),
    };
  }).filter(Boolean);
}

async function tick() {
  if (tickInFlight) return;
  tickInFlight = true;
  stats.ticks += 1;
  stats.lastTickAt = new Date().toISOString();
  try {
    const { data } = await axios.get(gatewayUrl(), { timeout: 4000 });
    const devices = parseDevices(data);
    for (const device of devices) {
      if (Number.isNaN(device.packetAt.getTime())) device.packetAt = new Date();
      const evaluation = evaluateReading(device);
      const result = await store.insertPacket({ ...device, health: evaluation.health });
      if (result.inserted) {
        stats.inserted += 1;
        stats.lastPayloadAt[device.deviceId] = device.packetAt.toISOString();
      } else {
        stats.skipped += 1;
      }
    }
    stats.lastError = devices.length ? null : 'empty_payload';
  } catch (err) {
    stats.lastError = err.message || 'fetch_failed';
  } finally {
    tickInFlight = false;
  }
}

async function start() {
  if (timer) return { started: true, already: true, intervalMs: intervalMs() };
  if (!store.dbEnabled()) {
    return { started: false, reason: 'DATABASE_URL not set' };
  }
  await store.initEspSchema();
  await tick();
  timer = setInterval(() => {
    tick().catch((err) => {
      stats.lastError = err.message;
    });
  }, intervalMs());
  if (typeof timer.unref === 'function') timer.unref();
  stats.startedAt = new Date().toISOString();
  return { started: true, intervalMs: intervalMs(), gateway: gatewayUrl() };
}

function status() {
  return {
    ...stats,
    running: Boolean(timer),
    intervalMs: intervalMs(),
    gateway: gatewayUrl(),
  };
}

module.exports = { start, tick, status, parseDevices, gatewayUrl, intervalMs };
