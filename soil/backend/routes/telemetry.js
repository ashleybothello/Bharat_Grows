/**
 * Telemetry API — nodes, readings, graphs, anomalies and simulation control.
 *
 * SCOPING
 * Every route runs behind `requireFarmer`, which resolves the Bearer token
 * through the existing farmerStore session map. Each query then filters by that
 * farmer's own id, so one farmer can never read another's telemetry. No route
 * accepts a farmer id, farm id, email or phone number from the client.
 *
 * BOUNDED RESPONSES
 * Nothing here can return an unbounded result set: history is paginated and
 * graph series are aggregated in SQL.
 */

const express = require('express');

const farmerStore = require('../services/farmerStore');
const store = require('../services/telemetry/telemetryStore');
const engine = require('../services/telemetry/simulationEngine');
const anomalyService = require('../services/telemetry/anomalyService');
const alertService = require('../services/telemetry/alertService');
const { evaluateReading, SENSORS, SENSOR_KEYS, GRADED_SENSOR_KEYS, classify, STATUS } = require('../services/telemetry/sensorSpec');
const { computeNodePlan } = require('../services/telemetry/nodeProvisioner');

const router = express.Router();

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/** Resolve the authenticated farmer, or 401. */
async function requireFarmer(req, res, next) {
  try {
    const phone = farmerStore.phoneFromToken(bearerToken(req));
    if (!phone) {
      return res.status(401).json({ code: 'NOT_AUTHENTICATED', error: 'Please sign in again.' });
    }
    const farmer = await farmerStore.findByPhone(phone);
    if (!farmer) {
      return res.status(404).json({ code: 'ACCOUNT_NOT_FOUND', error: 'Farmer profile not found.' });
    }
    req.farmer = farmer;
    return next();
  } catch {
    return res.status(500).json({ code: 'AUTH_FAILED', error: 'Could not verify your session.' });
  }
}

/** Uniform 503 when telemetry has nowhere to live. */
function requireDb(_req, res, next) {
  if (!store.dbEnabled()) {
    return res.status(503).json({
      code: 'TELEMETRY_DB_UNAVAILABLE',
      error: 'Sensor telemetry needs DATABASE_URL to be configured on the server.',
    });
  }
  return next();
}

router.use(requireFarmer);

// ───────────────────────────── shaping helpers ─────────────────────────────

/** Pull the sensor columns out of a telemetry row. */
function readingFromRow(row) {
  if (!row) return null;
  const reading = {};
  for (const key of store.READING_COLUMNS) {
    reading[key] = row[key] === null || row[key] === undefined ? null : Number(row[key]);
  }
  return reading;
}

/** Node + latest reading + derived status, as the Map page consumes it. */
function shapeNode(row) {
  const reading = readingFromRow(row);
  const hasReading = reading && reading.temperature !== null;
  const evaluation = hasReading ? evaluateReading(reading) : null;

  return {
    nodeId: row.node_id,
    nodeNumber: row.node_number,
    zone: row.zone,
    farmId: row.farm_id,
    farmName: row.farm_name,
    position: { x: Number(row.position_x), y: Number(row.position_y) },
    coordinates: row.latitude === null ? null : { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    coversSqMetres: row.covers_sq_metres,
    status: row.status,
    lastReadingAt: row.recorded_at || null,
    health: evaluation ? evaluation.health : null,
    colour: evaluation ? evaluation.colour : null,
    sensors: evaluation ? evaluation.sensors : {},
    criticalSensors: evaluation ? evaluation.critical.map((s) => s.key) : [],
    // Absent readings are reported as such rather than filled in.
    awaitingFirstReading: !hasReading,
  };
}

/** Sensor metadata so the frontend never restates units or thresholds. */
function sensorCatalogue() {
  return SENSOR_KEYS.map((key) => ({
    key,
    label: SENSORS[key].label,
    unit: SENSORS[key].unit,
    decimals: SENSORS[key].decimals,
    graded: GRADED_SENSOR_KEYS.includes(key),
    eventLike: Boolean(SENSORS[key].eventLike),
    informational: SENSORS[key].classify === 'informational',
  }));
}

// ────────────────────────────────── nodes ──────────────────────────────────

/**
 * GET /api/nodes
 * Every node with its latest reading and derived health, plus the coverage plan.
 */
router.get('/nodes', requireDb, async (req, res) => {
  try {
    const profile = req.farmer.profile || {};
    const plan = computeNodePlan(profile);

    let rows = await store.latestPerNode(req.farmer.id);

    // Provision on first visit so a farmer who signed up before this feature
    // existed still gets nodes without a manual migration step.
    if (!rows.length) {
      await engine.ensureNodesForFarmer(req.farmer);
      rows = await store.latestPerNode(req.farmer.id);
    }

    const nodes = rows.map(shapeNode);
    const tally = { GOOD: 0, AVERAGE: 0, BAD: 0, CRITICAL: 0, UNKNOWN: 0 };
    for (const node of nodes) tally[node.health || 'UNKNOWN'] += 1;

    res.json({
      success: true,
      farm: {
        farmId: `FARM-${req.farmer.id}`,
        farmName: profile.farmName || req.farmer.name || '',
        areaSqMetres: plan.areaSqMetres,
        plotSideMetres: plan.plotSideMetres || null,
        sizeLabel: profile.farmSize ? `${profile.farmSize} ${profile.farmSizeUnit || ''}`.trim() : null,
      },
      coverage: {
        sqMetresPerNode: plan.sqMetresPerNode,
        totalNodes: plan.total,
        simulatedNodes: plan.simulated,
        unprovisionedNodes: plan.unprovisioned,
        note: plan.unprovisioned > 0
          ? `This farm's area supports ${plan.total} nodes at ${plan.sqMetresPerNode} m² each. ${plan.simulated} are streaming live readings; the remaining ${plan.unprovisioned} are not provisioned.`
          : null,
        reason: plan.reason || null,
      },
      tally,
      nodes,
      sensorCatalogue: sensorCatalogue(),
    });
  } catch (err) {
    console.error('[telemetry] GET /nodes:', err.message);
    res.status(500).json({ code: 'NODES_FAILED', error: 'Could not load your sensor nodes.' });
  }
});

/** GET /api/nodes/:nodeId — node detail with anomaly summary. */
router.get('/nodes/:nodeId', requireDb, async (req, res) => {
  try {
    const node = await store.findNode(req.farmer.id, req.params.nodeId);
    if (!node) return res.status(404).json({ code: 'NODE_NOT_FOUND', error: 'No such node on your farm.' });

    const latest = await store.latestForNode(req.farmer.id, req.params.nodeId);
    const counts = await store.anomalyCountForNode(req.farmer.id, req.params.nodeId);
    const recent = await store.anomalyHistory({ farmerId: req.farmer.id, nodeId: req.params.nodeId, limit: 5 });

    res.json({
      success: true,
      node: shapeNode({ ...node, ...(latest || {}) }),
      anomalies: {
        total: counts.total,
        latestAt: counts.latest,
        recent: recent.rows,
      },
      activeAnomaly: engine.activeAnomalyFor(req.farmer.id, req.params.nodeId),
      sensorCatalogue: sensorCatalogue(),
    });
  } catch (err) {
    console.error('[telemetry] GET /nodes/:id:', err.message);
    res.status(500).json({ code: 'NODE_FAILED', error: 'Could not load this node.' });
  }
});

/** GET /api/nodes/:nodeId/latest */
router.get('/nodes/:nodeId/latest', requireDb, async (req, res) => {
  try {
    const node = await store.findNode(req.farmer.id, req.params.nodeId);
    if (!node) return res.status(404).json({ code: 'NODE_NOT_FOUND', error: 'No such node on your farm.' });

    const latest = await store.latestForNode(req.farmer.id, req.params.nodeId);
    if (!latest) {
      return res.status(404).json({
        code: 'NO_READINGS_YET',
        error: 'This node has not reported a reading yet.',
      });
    }
    res.json({ success: true, node: shapeNode({ ...node, ...latest }) });
  } catch (err) {
    console.error('[telemetry] GET /nodes/:id/latest:', err.message);
    res.status(500).json({ code: 'LATEST_FAILED', error: 'Could not load the latest reading.' });
  }
});

/** GET /api/nodes/:nodeId/history?limit=&offset=&range= — paginated raw rows. */
router.get('/nodes/:nodeId/history', requireDb, async (req, res) => {
  try {
    const result = await store.readingHistory({
      farmerId: req.farmer.id,
      nodeId: req.params.nodeId,
      limit: req.query.limit,
      offset: req.query.offset,
      range: req.query.range,
    });
    res.json({
      success: true,
      ...result,
      rows: result.rows.map((row) => ({
        ...row,
        evaluation: evaluateReading(readingFromRow(row)),
      })),
    });
  } catch (err) {
    console.error('[telemetry] GET /nodes/:id/history:', err.message);
    res.status(500).json({ code: 'HISTORY_FAILED', error: 'Could not load node history.' });
  }
});

/** GET /api/nodes/:nodeId/anomalies */
router.get('/nodes/:nodeId/anomalies', requireDb, async (req, res) => {
  try {
    const result = await store.anomalyHistory({
      farmerId: req.farmer.id,
      nodeId: req.params.nodeId,
      severity: req.query.severity,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[telemetry] GET /nodes/:id/anomalies:', err.message);
    res.status(500).json({ code: 'ANOMALIES_FAILED', error: 'Could not load node anomalies.' });
  }
});

// ──────────────────────────────── telemetry ────────────────────────────────

/**
 * Aggregate the newest reading of every node into one farm-level reading.
 *
 * AGGREGATION METHOD — deliberately not a blanket average:
 *   mean  N, P, K, soil moisture, temperature, humidity, light, rain
 *         Field-wide concentrations and ambient measurements, where the mean is
 *         the representative value for the block.
 *   min   water level — the scarcest reservoir governs irrigation risk, so an
 *         average would hide a nearly empty zone.
 *   max   flame, PIR — alarm states. One node detecting fire or motion means the
 *         farm has fire or motion.
 */
function aggregateFarmReading(nodeRows) {
  const withReadings = nodeRows.filter((r) => r.recorded_at);
  if (!withReadings.length) return null;

  const meanOf = (key) => {
    const values = withReadings.map((r) => Number(r[key])).filter(Number.isFinite);
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };
  const minOf = (key) => {
    const values = withReadings.map((r) => Number(r[key])).filter(Number.isFinite);
    return values.length ? Math.min(...values) : null;
  };
  const maxOf = (key) => {
    const values = withReadings.map((r) => Number(r[key])).filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  };

  const round = (v, d) => (v === null ? null : Number(v.toFixed(d)));

  const reading = {
    nitrogen: round(meanOf('nitrogen'), 0),
    phosphorus: round(meanOf('phosphorus'), 0),
    potassium: round(meanOf('potassium'), 0),
    soil_moisture: round(meanOf('soil_moisture'), 0),
    temperature: round(meanOf('temperature'), 1),
    humidity: round(meanOf('humidity'), 0),
    light: round(meanOf('light'), 0),
    rain: round(meanOf('rain'), 1),
    water_level: minOf('water_level'),
    flame: maxOf('flame'),
    pir: maxOf('pir'),
  };

  return {
    reading,
    nodesIncluded: withReadings.length,
    method: {
      mean: ['nitrogen', 'phosphorus', 'potassium', 'soil_moisture', 'temperature', 'humidity', 'light', 'rain'],
      min: ['water_level'],
      max: ['flame', 'pir'],
      rationale: 'Means represent field-wide concentrations and ambient conditions. Water level uses the minimum because the scarcest zone governs irrigation risk. Flame and PIR use the maximum because they are alarm states.',
    },
  };
}

/** GET /api/telemetry/latest — farm aggregate plus per-node readings. */
router.get('/telemetry/latest', requireDb, async (req, res) => {
  try {
    const rows = await store.latestPerNode(req.farmer.id);
    const aggregate = aggregateFarmReading(rows);

    res.json({
      success: true,
      farm: aggregate
        ? {
            ...aggregate,
            evaluation: evaluateReading(aggregate.reading),
            recordedAt: rows.reduce((latest, r) => (r.recorded_at && (!latest || r.recorded_at > latest) ? r.recorded_at : latest), null),
          }
        : null,
      nodes: rows.map(shapeNode),
      sensorCatalogue: sensorCatalogue(),
    });
  } catch (err) {
    console.error('[telemetry] GET /telemetry/latest:', err.message);
    res.status(500).json({ code: 'LATEST_FAILED', error: 'Could not load the latest telemetry.' });
  }
});

/** GET /api/telemetry/history?nodeId=&limit=&offset=&range= */
router.get('/telemetry/history', requireDb, async (req, res) => {
  try {
    const result = await store.readingHistory({
      farmerId: req.farmer.id,
      nodeId: req.query.nodeId || null,
      limit: req.query.limit,
      offset: req.query.offset,
      range: req.query.range,
    });
    res.json({
      success: true,
      ...result,
      rows: result.rows.map((row) => ({ ...row, evaluation: evaluateReading(readingFromRow(row)) })),
    });
  } catch (err) {
    console.error('[telemetry] GET /telemetry/history:', err.message);
    res.status(500).json({ code: 'HISTORY_FAILED', error: 'Could not load telemetry history.' });
  }
});

/**
 * GET /api/telemetry/trends?sensor=&range=1d|1w|1m|1y&nodeId=
 * Aggregated graph series. Raw rows behind each bucket are retained.
 */
router.get('/telemetry/trends', requireDb, async (req, res) => {
  const sensor = String(req.query.sensor || 'temperature');
  const range = String(req.query.range || '1d');

  if (!store.READING_COLUMNS.includes(sensor)) {
    return res.status(400).json({
      code: 'UNKNOWN_SENSOR',
      error: `Unknown sensor '${sensor}'. Expected one of: ${store.READING_COLUMNS.join(', ')}.`,
    });
  }
  if (!store.RANGE_CONFIG[range.toLowerCase()]) {
    return res.status(400).json({
      code: 'UNKNOWN_RANGE',
      error: `Unknown range '${range}'. Expected one of: ${Object.keys(store.RANGE_CONFIG).join(', ')}.`,
    });
  }

  try {
    const series = await store.sensorSeries({
      farmerId: req.farmer.id,
      nodeId: req.query.nodeId || null,
      sensor,
      range,
    });

    res.json({
      success: true,
      sensor,
      nodeId: req.query.nodeId || null,
      unit: SENSORS[sensor]?.unit ?? '',
      label: SENSORS[sensor]?.label ?? sensor,
      informational: SENSORS[sensor]?.classify === 'informational',
      ...series,
      // Status bands so the chart can shade them without duplicating thresholds.
      thresholds: SENSORS[sensor]?.bands
        ? SENSORS[sensor].bands.map((b) => ({ upTo: b.bound, inclusive: b.kind === 'lte', status: b.status }))
        : null,
    });
  } catch (err) {
    console.error('[telemetry] GET /telemetry/trends:', err.message);
    res.status(500).json({ code: 'TRENDS_FAILED', error: 'Could not build the trend series.' });
  }
});

/** GET /api/anomalies?nodeId=&severity=&limit=&offset= */
router.get('/anomalies', requireDb, async (req, res) => {
  try {
    const result = await store.anomalyHistory({
      farmerId: req.farmer.id,
      nodeId: req.query.nodeId || null,
      severity: req.query.severity || null,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[telemetry] GET /anomalies:', err.message);
    res.status(500).json({ code: 'ANOMALIES_FAILED', error: 'Could not load anomaly history.' });
  }
});

// ─────────────────────────── analysis integration ───────────────────────────

/**
 * GET /api/telemetry/analysis-input?scope=farm|node&nodeId=
 *
 * The values Analyze and Results use. Returns only what the sensors actually
 * measure, and states plainly which model features the sensors cannot supply.
 *
 * NOT SENSED:
 *   ph        No pH sensor exists in the node specification, but the crop model
 *             requires it, so the farmer supplies it.
 *   rainfall  The rain sensor reports instantaneous mm at the node. The crop
 *             model's `rainfall` feature is a seasonal total, a different
 *             quantity. Measured rain is returned as `rain_recent_mm` for
 *             context and is never passed off as the model's rainfall feature.
 */
router.get('/telemetry/analysis-input', requireDb, async (req, res) => {
  try {
    const scope = String(req.query.scope || 'farm').toLowerCase();
    const rows = await store.latestPerNode(req.farmer.id);

    if (!rows.some((r) => r.recorded_at)) {
      return res.status(404).json({
        code: 'NO_READINGS_YET',
        error: 'No sensor readings have been recorded yet. Wait for the simulator to produce a reading.',
      });
    }

    let reading;
    let sourceLabel;
    let aggregation = null;

    if (scope === 'node') {
      const nodeId = String(req.query.nodeId || '');
      const row = rows.find((r) => r.node_id === nodeId);
      if (!row) return res.status(404).json({ code: 'NODE_NOT_FOUND', error: 'No such node on your farm.' });
      if (!row.recorded_at) {
        return res.status(404).json({ code: 'NO_READINGS_YET', error: 'This node has not reported a reading yet.' });
      }
      reading = readingFromRow(row);
      sourceLabel = `Node ${row.node_number} (${row.zone}), latest reading`;
    } else {
      const aggregate = aggregateFarmReading(rows);
      reading = aggregate.reading;
      aggregation = aggregate.method;
      sourceLabel = `Whole farm, aggregated across ${aggregate.nodesIncluded} node(s)`;
    }

    const evaluation = evaluateReading(reading);

    res.json({
      success: true,
      scope,
      sourceLabel,
      recordedAt: scope === 'node'
        ? rows.find((r) => r.node_id === req.query.nodeId)?.recorded_at
        : rows.reduce((l, r) => (r.recorded_at && (!l || r.recorded_at > l) ? r.recorded_at : l), null),
      // Sensor-measured values, ready to prefill the Analyze form.
      sensed: {
        n: reading.nitrogen,
        p: reading.phosphorus,
        k: reading.potassium,
        temperature: reading.temperature,
        humidity: reading.humidity,
        moisture: reading.soil_moisture,
      },
      context: {
        light: reading.light,
        water_level: reading.water_level,
        rain_recent_mm: reading.rain,
        flame: reading.flame,
        pir: reading.pir,
      },
      notSensed: {
        ph: 'No pH sensor exists in the node specification. The crop model requires pH, so it must be supplied by the farmer.',
        rainfall: 'The rain sensor measures instantaneous rainfall at the node. The crop model\'s rainfall feature is a seasonal total, so it is not taken from this sensor.',
      },
      aggregation,
      evaluation,
      sensorCatalogue: sensorCatalogue(),
    });
  } catch (err) {
    console.error('[telemetry] GET /telemetry/analysis-input:', err.message);
    res.status(500).json({ code: 'ANALYSIS_INPUT_FAILED', error: 'Could not build the analysis input.' });
  }
});

// ─────────────────────────── simulation control ───────────────────────────

/** GET /api/simulation/status — engine health and delivery readiness. */
router.get('/simulation/status', (req, res) => {
  res.json({
    success: true,
    simulation: engine.status(),
    anomalies: anomalyService.anomalyStats(),
    // Booleans only; no credential is ever returned.
    alerts: alertService.alertConfigStatus(),
  });
});

/**
 * POST /api/simulation/anomaly — the demo trigger.
 * Body: { nodeId, sensor, value, ticks? }
 *
 * Injects the anomaly into the running simulation, persists a MANUAL anomaly
 * row, and always attempts SMS + email for this explicit click (repeat clicks
 * on the same node/sensor still notify). Background telemetry keeps its
 * transition gate so a node sitting at CRITICAL is not emailed every 10s.
 */
router.post('/simulation/anomaly', requireDb, async (req, res) => {
  try {
    const { nodeId, sensor, value, ticks } = req.body || {};

    const node = await store.findNode(req.farmer.id, String(nodeId || ''));
    if (!node) return res.status(404).json({ code: 'NODE_NOT_FOUND', error: 'No such node on your farm.' });

    if (!GRADED_SENSOR_KEYS.includes(String(sensor))) {
      return res.status(400).json({
        code: 'INVALID_SENSOR',
        error: `Sensor must be one of: ${GRADED_SENSOR_KEYS.join(', ')}.`,
      });
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return res.status(400).json({ code: 'INVALID_VALUE', error: 'Anomaly value must be a number.' });
    }

    const injected = engine.injectAnomaly({
      farmerId: req.farmer.id,
      nodeId: node.node_id,
      sensor: String(sensor),
      value: numeric,
      ticks: ticks,
    });

    const expectedStatus = classify(String(sensor), numeric);
    // Stop the automatic transition gate from also emailing on this same tick.
    anomalyService.acknowledgeManualTick(
      req.farmer.id,
      node.node_id,
      String(sensor),
      expectedStatus,
    );

    // Run a tick now so the demo does not wait up to 10 seconds.
    await engine.tick();

    let notifications = {
      sms: { attempted: false, sent: false },
      email: { attempted: false, sent: false },
    };
    let anomaly = null;
    try {
      const notified = await anomalyService.notifyManualSimulation({
        farmer: req.farmer,
        node,
        sensorKey: String(sensor),
        value: numeric,
        status: expectedStatus,
      });
      notifications = notified.notifications;
      anomaly = notified.anomaly
        ? {
          id: notified.anomaly.id,
          sensor: String(sensor),
          severity: expectedStatus,
          value: numeric,
        }
        : null;
    } catch (err) {
      console.error('[ALERT] manual notify failed:', err.message);
    }

    res.json({
      success: true,
      injected,
      expectedStatus,
      nodeNumber: node.node_number,
      anomaly,
      notifications,
      message: `Node ${node.node_number} ${SENSORS[sensor].label} pinned to ${numeric}.`,
    });
  } catch (err) {
    console.error('[telemetry] POST /simulation/anomaly:', err.message);
    res.status(500).json({ code: 'ANOMALY_TRIGGER_FAILED', error: 'Could not trigger the anomaly.' });
  }
});

/** POST /api/simulation/anomaly/clear — restore a node to normal. */
router.post('/simulation/anomaly/clear', requireDb, async (req, res) => {
  try {
    const { nodeId } = req.body || {};
    const node = await store.findNode(req.farmer.id, String(nodeId || ''));
    if (!node) return res.status(404).json({ code: 'NODE_NOT_FOUND', error: 'No such node on your farm.' });

    const cleared = engine.clearAnomaly({ farmerId: req.farmer.id, nodeId: node.node_id });
    await engine.tick();

    res.json({
      success: true,
      cleared,
      nodeNumber: node.node_number,
      message: cleared
        ? `Node ${node.node_number} released; it will walk back to its baseline.`
        : `Node ${node.node_number} had no active anomaly.`,
    });
  } catch (err) {
    console.error('[telemetry] POST /simulation/anomaly/clear:', err.message);
    res.status(500).json({ code: 'ANOMALY_CLEAR_FAILED', error: 'Could not clear the anomaly.' });
  }
});

module.exports = { router, requireFarmer, aggregateFarmReading, sensorCatalogue, STATUS };
