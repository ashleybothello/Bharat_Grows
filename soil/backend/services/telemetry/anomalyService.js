/**
 * Anomaly detection and alert gating.
 *
 * TRANSITIONS, NOT LEVELS
 * The last known status of every (farmer, node, sensor) is held in memory. An
 * anomaly row is written when a sensor moves from a healthier status into
 * AVERAGE, BAD or CRITICAL — not on every tick it stays there. That is what
 * stops a node sitting at CRITICAL from emailing the farmer every 10 seconds.
 *
 *   GOOD -> CRITICAL      anomaly recorded, email + SMS sent
 *   CRITICAL -> CRITICAL  nothing; the episode is already open
 *   CRITICAL -> GOOD      episode resolved, state cleared
 *   GOOD -> CRITICAL      a new episode, so a new alert is sent
 *
 * AVERAGE and BAD are persisted so they appear in History, but never notify.
 *
 * GROUPING
 * When several sensors on one node turn critical on the same tick, each gets its
 * own anomaly row but the farmer receives a single email and a single SMS
 * listing all of them.
 *
 * PIR IS EXCLUDED
 * Motion legitimately reads 1 during normal operation, so treating it as an
 * anomaly would bury real events. PIR still appears in readings, node detail
 * and history; it just never creates an anomaly row.
 */

const { pool } = require('../../db');
const store = require('./telemetryStore');
const alertService = require('./alertService');
const { STATUS, SEVERITY_ORDER, SENSORS } = require('./sensorSpec');

/** Last seen status per `${farmerId}:${nodeId}:${sensor}`. */
const lastStatus = new Map();

/** Sensors that never generate anomaly events. */
const EXCLUDED_SENSORS = new Set(['pir', 'rain']);

const stats = {
  anomaliesRecorded: 0,
  alertsSent: 0,
  alertsSuppressed: 0,
  lastAlertAt: null,
};

function stateKey(farmerId, nodeId, sensor) {
  return `${farmerId}:${nodeId}:${sensor}`;
}

/** Cached farmer contact details, so alerts don't re-query on every tick. */
const farmerCache = new Map();

/**
 * Resolve the alert recipients for a farmer from their own record.
 *
 * Email comes from the profile's `email`, falling back to ALERT_TO_EMAIL when
 * the farmer has not supplied one. Phone is the registered mobile number used
 * for OTP login. Neither is ever accepted from the frontend.
 */
async function farmerContact(farmerId) {
  if (farmerCache.has(farmerId)) return farmerCache.get(farmerId);

  let contact = { email: null, phone: null, name: null, farmName: null };

  if (store.dbEnabled()) {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, phone, profile FROM farmers WHERE id = $1;`,
        [farmerId]
      );
      if (rows[0]) {
        const profile = rows[0].profile || {};
        contact = {
          name: rows[0].name || profile.fullName || null,
          phone: rows[0].phone || profile.phone || null,
          email: profile.email || null,
          farmName: profile.farmName || null,
        };
      }
    } catch (err) {
      console.error('[anomaly] could not load farmer contact:', err.message);
    }
  }

  if (!contact.email) {
    const fallback = String(process.env.ALERT_TO_EMAIL || '').trim();
    if (fallback) contact.email = fallback;
  }

  farmerCache.set(farmerId, contact);
  return contact;
}

/** Drop a cached contact, e.g. after the farmer edits their profile. */
function invalidateFarmerContact(farmerId) {
  farmerCache.delete(farmerId);
}

function severityOf(status) {
  return SEVERITY_ORDER[status] ?? 0;
}

function describe(sensor, status) {
  return `${sensor.label} reading of ${sensor.value}${sensor.unit ? ` ${sensor.unit}` : ''} is ${status}.`;
}

/**
 * Mark this sensor as already at `status` so the immediate simulation tick
 * does not also fire the automatic CRITICAL-transition alert. Manual Simulate
 * anomaly always notifies itself.
 */
function acknowledgeManualTick(farmerId, nodeId, sensor, status) {
  lastStatus.set(stateKey(farmerId, nodeId, sensor), status);
}

/**
 * Persist and notify for an explicit Farm Map "Simulate anomaly" click.
 * Runs even when the same node/sensor is already CRITICAL. Notification
 * failures never delete the saved anomaly.
 */
async function notifyManualSimulation({
  farmer, node, sensorKey, value, status, detectedAt,
}) {
  const spec = SENSORS[sensorKey] || { key: sensorKey, label: sensorKey, unit: '' };
  const at = detectedAt || new Date();
  const nodeLabel = String(node.node_number).padStart(2, '0');
  console.log(`[ANOMALY] Node ${nodeLabel} / ${spec.label} generated`);

  let row = null;
  try {
    row = await store.insertAnomaly({
      nodeId: node.node_id,
      farmerId: farmer.id,
      farmId: node.farm_id,
      detectedAt: at,
      sensor: sensorKey,
      value,
      severity: status,
      message: describe({ label: spec.label, value, unit: spec.unit }, status),
      trigger: 'MANUAL',
    });
  } catch (err) {
    console.error('[ANOMALY] persist failed:', err.message);
  }

  const contact = await farmerContact(farmer.id);
  const profile = farmer.profile || {};
  const result = await alertService.dispatchManualAnomalyAlert({
    recipientEmail: contact.email,
    recipientPhone: contact.phone,
    farmerName: contact.name || farmer.name || profile.fullName || null,
    farmName: node.farm_name || contact.farmName || profile.farmName || null,
    nodeNumber: node.node_number,
    sensorLabel: spec.label,
    status,
    value,
    unit: spec.unit,
    detectedAt: at,
  });

  try {
    if (row?.id) {
      await store.markAnomalyDispatch(row.id, {
        emailSent: result.emailSent,
        smsSent: result.smsSent,
        emailError: result.emailError,
        smsError: result.smsError,
      });
    }
  } catch (err) {
    console.error('[ANOMALY] could not store dispatch flags:', err.message);
  }

  return {
    anomaly: row,
    notifications: {
      sms: { attempted: Boolean(result.smsAttempted), sent: Boolean(result.smsSent) },
      email: { attempted: Boolean(result.emailAttempted), sent: Boolean(result.emailSent) },
    },
  };
}

/**
 * Process one tick's evaluated readings.
 *
 * `evaluations` is [{ node, reading, evaluation, recordedAt }]. Returns a
 * summary of what was recorded and alerted, which the tests assert against.
 */
async function processEvaluations(evaluations = []) {
  const recorded = [];
  const alerted = [];

  for (const entry of evaluations) {
    const { node, evaluation, recordedAt } = entry;
    const farmerId = node.farmer_id;
    const nodeId = node.node_id;

    const newlyCritical = [];

    for (const sensor of Object.values(evaluation.sensors)) {
      if (EXCLUDED_SENSORS.has(sensor.key)) continue;
      if (sensor.status === STATUS.INFORMATIONAL) continue;

      const key = stateKey(farmerId, nodeId, sensor.key);
      const previous = lastStatus.get(key) || STATUS.GOOD;

      if (sensor.status === previous) continue; // No transition, nothing to do.

      lastStatus.set(key, sensor.status);

      // Recovered to GOOD: close the episode so a later relapse alerts again.
      if (sensor.status === STATUS.GOOD) {
        if (severityOf(previous) > 0) {
          await store.resolveOpenAnomalies(farmerId, nodeId, sensor.key, recordedAt);
        }
        continue;
      }

      // Only a move to a *worse* status is an anomaly. Easing from CRITICAL to
      // BAD is an improvement and should not be recorded as a new event.
      if (severityOf(sensor.status) <= severityOf(previous)) continue;

      const row = await store.insertAnomaly({
        nodeId,
        farmerId,
        farmId: node.farm_id,
        detectedAt: recordedAt,
        sensor: sensor.key,
        value: sensor.value,
        severity: sensor.status,
        message: describe(sensor, sensor.status),
        trigger: entry.trigger || 'SIMULATION',
      });

      stats.anomaliesRecorded += 1;
      recorded.push(row || { nodeId, sensor: sensor.key, severity: sensor.status });

      // Alerts are for CRITICAL only.
      if (sensor.status === STATUS.CRITICAL) {
        newlyCritical.push({ sensor, anomalyId: row ? row.id : null });
      } else {
        stats.alertsSuppressed += 1;
      }
    }

    if (!newlyCritical.length) continue;

    // One email and one SMS per node per tick, listing every critical sensor.
    const contact = await farmerContact(farmerId);
    const result = await alertService.dispatchCriticalAlert({
      recipientEmail: contact.email,
      recipientPhone: contact.phone,
      nodeNumber: node.node_number,
      criticalSensors: newlyCritical.map((c) => c.sensor),
      detectedAt: recordedAt,
      farmName: node.farm_name,
      zone: node.zone,
    });

    for (const { anomalyId } of newlyCritical) {
      if (anomalyId) {
        await store.markAnomalyDispatch(anomalyId, {
          emailSent: result.emailSent,
          smsSent: result.smsSent,
          emailError: result.emailError,
          smsError: result.smsError,
        });
      }
    }

    stats.alertsSent += 1;
    stats.lastAlertAt = recordedAt;

    alerted.push({
      nodeId,
      nodeNumber: node.node_number,
      sensors: newlyCritical.map((c) => c.sensor.key),
      emailSent: result.emailSent,
      smsSent: result.smsSent,
      emailError: result.emailError,
      smsError: result.smsError,
    });

    if (result.emailError) console.error(`[anomaly] node ${node.node_number} email: ${result.emailError}`);
    if (result.smsError) console.error(`[anomaly] node ${node.node_number} sms: ${result.smsError}`);
  }

  return { recorded, alerted };
}

/** Current tracked status for a node, for diagnostics and tests. */
function trackedStatuses(farmerId, nodeId) {
  const prefix = `${farmerId}:${nodeId}:`;
  const out = {};
  for (const [key, value] of lastStatus.entries()) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  }
  return out;
}

/** Reset transition memory. Used by tests; not exposed over HTTP. */
function resetState() {
  lastStatus.clear();
  farmerCache.clear();
}

function anomalyStats() {
  return { ...stats, trackedSensors: lastStatus.size };
}

module.exports = {
  processEvaluations,
  farmerContact,
  invalidateFarmerContact,
  acknowledgeManualTick,
  notifyManualSimulation,
  trackedStatuses,
  resetState,
  anomalyStats,
  EXCLUDED_SENSORS,
  lastStatus,
};
