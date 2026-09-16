/**
 * Alert-gating tests for services/telemetry/anomalyService.js.
 *
 * Covers steps 28-37 of the acceptance scenario without needing a database or
 * real deliveries: the telemetry store and alert service are stubbed, so what
 * is under test is purely the state-transition logic that decides when an alert
 * may be sent.
 *
 *   node scripts/test-anomaly-gating.js
 */

const path = require('path');

// Stub the store before anomalyService requires it.
const storePath = require.resolve('../services/telemetry/telemetryStore');
const inserted = [];
const resolved = [];
let nextId = 1;

require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: {
    dbEnabled: () => false,
    async insertAnomaly(a) {
      const row = { id: nextId++, ...a };
      inserted.push(row);
      return row;
    },
    async resolveOpenAnomalies(farmerId, nodeId, sensor, at) {
      resolved.push({ farmerId, nodeId, sensor, at });
      return 1;
    },
    async markAnomalyDispatch() { return null; },
  },
};

// Stub alert delivery and count dispatches.
const alertPath = require.resolve('../services/telemetry/alertService');
const dispatches = [];
require.cache[alertPath] = {
  id: alertPath,
  filename: alertPath,
  loaded: true,
  exports: {
    async dispatchCriticalAlert(payload) {
      dispatches.push(payload);
      return { emailSent: true, smsSent: true, emailError: null, smsError: null };
    },
  },
};

const anomalyService = require('../services/telemetry/anomalyService');
const { evaluateReading } = require('../services/telemetry/sensorSpec');

let pass = 0;
let fail = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const node = {
  farmer_id: 1,
  node_id: 'BG-NODE-003',
  node_number: 3,
  farm_id: 'FARM-1',
  farm_name: 'Bothello Farm',
  zone: 'Zone C',
};

const healthy = {
  nitrogen: 48, phosphorus: 32, potassium: 64, soil_moisture: 61,
  temperature: 28.1, humidity: 67, light: 920, water_level: 74,
  flame: 0, pir: 0, rain: 12,
};

/** Feed one reading through the detector. */
async function feed(reading, at) {
  const evaluation = evaluateReading(reading);
  return anomalyService.processEvaluations([
    { node, reading, evaluation, recordedAt: at || new Date() },
  ]);
}

(async () => {
  // ── Baseline: healthy readings must produce nothing at all.
  await feed(healthy);
  await feed(healthy);
  assert('healthy readings record no anomaly', inserted.length === 0, `got ${inserted.length}`);
  assert('healthy readings send no alert', dispatches.length === 0);

  // ── Step 27-30: nitrogen = 7 turns CRITICAL, exactly one alert.
  await feed({ ...healthy, nitrogen: 7 });
  assert('critical records one anomaly', inserted.length === 1, `got ${inserted.length}`);
  assert('critical severity persisted', inserted[0]?.severity === 'CRITICAL');
  assert('critical value persisted', inserted[0]?.value === 7);
  assert('critical sensor persisted', inserted[0]?.sensor === 'nitrogen');
  assert('exactly one email+sms dispatch', dispatches.length === 1, `got ${dispatches.length}`);
  assert('alert names node 3', dispatches[0]?.nodeNumber === 3);
  assert('alert carries zone', dispatches[0]?.zone === 'Zone C');
  assert('alert carries farm', dispatches[0]?.farmName === 'Bothello Farm');

  // ── Step 32-33: it stays critical for many ticks; no further alerts.
  for (let i = 0; i < 30; i += 1) await feed({ ...healthy, nitrogen: 7 });
  assert('no repeat alert while critical', dispatches.length === 1, `got ${dispatches.length}`);
  assert('no duplicate anomaly rows while critical', inserted.length === 1, `got ${inserted.length}`);

  // ── Step 34-35: recovery closes the episode.
  await feed(healthy);
  assert('recovery resolves the open anomaly', resolved.length === 1, `got ${resolved.length}`);
  assert('recovery sends no alert', dispatches.length === 1);

  // ── Step 36-37: a new critical episode may alert again.
  await feed({ ...healthy, nitrogen: 6 });
  assert('new episode alerts again', dispatches.length === 2, `got ${dispatches.length}`);
  assert('new episode records a new anomaly', inserted.length === 2, `got ${inserted.length}`);

  // ── AVERAGE and BAD are recorded but never alerted.
  anomalyService.resetState();
  inserted.length = 0;
  dispatches.length = 0;

  await feed({ ...healthy, temperature: 34.1 }); // AVERAGE
  assert('average is recorded', inserted.length === 1 && inserted[0].severity === 'AVERAGE');
  assert('average sends no alert', dispatches.length === 0, `got ${dispatches.length}`);

  await feed({ ...healthy, temperature: 37 }); // BAD (worse, so a new event)
  assert('bad is recorded', inserted.some((r) => r.severity === 'BAD'));
  assert('bad sends no alert', dispatches.length === 0, `got ${dispatches.length}`);

  // Easing from BAD back to AVERAGE is an improvement, not a new anomaly.
  const beforeEase = inserted.length;
  await feed({ ...healthy, temperature: 34.1 });
  assert('improvement is not a new anomaly', inserted.length === beforeEase, `got ${inserted.length}`);

  // Escalating AVERAGE -> CRITICAL must alert.
  await feed({ ...healthy, temperature: 44 });
  assert('escalation to critical alerts', dispatches.length === 1, `got ${dispatches.length}`);

  // ── Several sensors critical at once: one alert, but one row per sensor.
  anomalyService.resetState();
  inserted.length = 0;
  dispatches.length = 0;

  await feed({ ...healthy, nitrogen: 7, water_level: 12, flame: 1 });
  assert('three critical sensors record three rows', inserted.length === 3, `got ${inserted.length}`);
  assert('three critical sensors send one alert', dispatches.length === 1, `got ${dispatches.length}`);
  assert('alert lists all three sensors', dispatches[0]?.criticalSensors?.length === 3,
    `got ${dispatches[0]?.criticalSensors?.length}`);

  // ── PIR motion must never create an anomaly.
  anomalyService.resetState();
  inserted.length = 0;
  dispatches.length = 0;

  for (let i = 0; i < 10; i += 1) await feed({ ...healthy, pir: i % 2 });
  assert('pir never creates an anomaly', inserted.length === 0, `got ${inserted.length}`);

  // ── Heavy rain is informational and must never alert.
  await feed({ ...healthy, rain: 480 });
  assert('rain never creates an anomaly', inserted.length === 0, `got ${inserted.length}`);
  assert('rain never alerts', dispatches.length === 0);

  console.log(`\nanomaly gating: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
