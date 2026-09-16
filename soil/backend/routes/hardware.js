/**
 * Public Hardware Beta API.
 * Reads persisted ESP32 packets. Does not mix with simulated farm nodes.
 */

const express = require('express');
const store = require('../services/telemetry/espStore');
const ingest = require('../services/telemetry/espIngest');
const { evaluateReading, SENSORS } = require('../services/telemetry/sensorSpec');

const router = express.Router();

function shapeDevice(row) {
  if (!row) return null;
  const reading = store.readingFromRow(row);
  const evaluation = reading ? evaluateReading(reading) : null;
  const sensors = {};
  if (evaluation?.sensors) {
    for (const [key, item] of Object.entries(evaluation.sensors)) {
      sensors[key] = {
        key,
        label: item.label,
        value: item.value,
        unit: item.unit || SENSORS[key]?.unit || '',
        status: item.status,
      };
    }
  }
  const seenAt = row.last_seen_at || row.recorded_at || row.packet_at;
  const ageMs = seenAt ? Date.now() - new Date(seenAt).getTime() : null;
  return {
    deviceId: row.device_id,
    nodeId: row.node_id,
    source: row.source || 'ESP32',
    recordedAt: row.recorded_at,
    lastSeenAt: row.last_seen_at,
    packetAt: row.packet_at,
    online: ageMs != null && ageMs < ingest.intervalMs() * 4,
    health: evaluation?.health || row.health || null,
    colour: evaluation?.colour || null,
    sensors,
    reading,
  };
}

router.get('/live', async (_req, res) => {
  try {
    if (!store.dbEnabled()) {
      return res.status(503).json({
        code: 'TELEMETRY_DB_UNAVAILABLE',
        error: 'Hardware telemetry needs DATABASE_URL on the server.',
      });
    }
    const rows = await store.latestPerDevice();
    rows.sort((a, b) => Number(a.device_id) - Number(b.device_id));
    res.json({
      success: true,
      source: 'ESP32',
      intervalMs: ingest.intervalMs(),
      ingest: ingest.status(),
      devices: rows.map(shapeDevice).filter(Boolean),
    });
  } catch (err) {
    console.error('[hardware/live]', err.message);
    res.status(500).json({ code: 'HARDWARE_LIVE_FAILED', error: 'Could not read ESP32 readings.' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || '').trim();
    if (!deviceId) {
      return res.status(400).json({ code: 'INVALID_INPUT', error: 'deviceId is required.' });
    }
    const rows = await store.recentForDevice(deviceId, req.query.limit);
    res.json({
      success: true,
      source: 'ESP32',
      deviceId,
      rows: rows.map(shapeDevice).filter(Boolean),
    });
  } catch (err) {
    console.error('[hardware/history]', err.message);
    res.status(500).json({ code: 'HARDWARE_HISTORY_FAILED', error: 'Could not read ESP32 history.' });
  }
});

module.exports = { router };
