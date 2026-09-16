/**
 * Realism checks for the sensor generator.
 *
 * Asserts the three properties the brief calls for: consecutive readings move in
 * small steps, normal operation stays healthy, and nodes differ from each other
 * while neighbours stay similar.
 *
 *   node scripts/test-simulation-realism.js
 */

const engine = require('../services/telemetry/simulationEngine');
const { evaluateReading, STATUS } = require('../services/telemetry/sensorSpec');
const { buildNodeLayout } = require('../services/telemetry/nodeProvisioner');

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

const profile = { farmSize: 5, farmSizeUnit: 'Acres', latitude: 22.7196, longitude: 75.8577 };
const { nodes } = buildNodeLayout(profile);

/** Build in-memory walk state without touching the database. */
function freshState(node) {
  const baselines = engine.baselinesFor(node);
  return {
    key: `1:${node.nodeId}`,
    baselines,
    current: {
      nitrogen: baselines.nitrogen,
      phosphorus: baselines.phosphorus,
      potassium: baselines.potassium,
      soil_moisture: baselines.soil_moisture,
      temperature: baselines.temperature,
      humidity: baselines.humidity,
      light: baselines.light,
      water_level: baselines.water_level,
    },
    rainSpellTicks: 0,
    rainIntensity: 0,
  };
}

// ── Walk one node across a simulated day (8640 ticks at 10s).
const node = { ...nodes[2], node_id: nodes[2].nodeId, farmer_id: 1, position_x: nodes[2].positionX, position_y: nodes[2].positionY };
const state = freshState(nodes[2]);

const series = [];
const start = new Date('2026-09-15T00:00:00+05:30');
const TICKS = 8640;

for (let i = 0; i < TICKS; i += 1) {
  const now = new Date(start.getTime() + i * 10000);
  series.push({ now, reading: engine.generateReading(node, state, now) });
}

// ── Step size: consecutive readings must move gradually.
function maxStep(key) {
  let max = 0;
  for (let i = 1; i < series.length; i += 1) {
    max = Math.max(max, Math.abs(series[i].reading[key] - series[i - 1].reading[key]));
  }
  return max;
}

const tempStep = maxStep('temperature');
const moistStep = maxStep('soil_moisture');
const nStep = maxStep('nitrogen');

assert('temperature moves <=1.0C per tick', tempStep <= 1.0, `max step ${tempStep.toFixed(2)}`);
assert('soil moisture moves <=2 per tick', moistStep <= 2, `max step ${moistStep}`);
assert('nitrogen moves <=2 per tick', nStep <= 2, `max step ${nStep}`);

// ── Normal operation must stay healthy: no CRITICAL without an anomaly.
const healths = series.map((s) => evaluateReading(s.reading).health);
const criticalCount = healths.filter((h) => h === STATUS.CRITICAL).length;
const goodCount = healths.filter((h) => h === STATUS.GOOD).length;

assert('no critical readings during normal simulation', criticalCount === 0, `got ${criticalCount}`);
assert('mostly good readings', goodCount / healths.length > 0.9,
  `good ${(100 * goodCount / healths.length).toFixed(1)}%`);

// ── Light must never go critical overnight (the darkness caveat).
const nightLights = series
  .filter((s) => s.now.getHours() >= 1 && s.now.getHours() <= 4)
  .map((s) => s.reading.light);
assert('night light stays in healthy band', Math.min(...nightLights) >= 500,
  `min ${Math.min(...nightLights)}`);

// ── Daily variation: midday must be warmer and brighter than pre-dawn.
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const preDawn = series.filter((s) => s.now.getHours() === 4);
const midday = series.filter((s) => s.now.getHours() === 13);
const tempRise = avg(midday.map((s) => s.reading.temperature)) - avg(preDawn.map((s) => s.reading.temperature));
const lightRise = avg(midday.map((s) => s.reading.light)) - avg(preDawn.map((s) => s.reading.light));

assert('temperature has a daily cycle', tempRise > 2, `midday-predawn ${tempRise.toFixed(2)}C`);
assert('light has a daily cycle', lightRise > 100, `midday-predawn ${lightRise.toFixed(0)} lux`);

// ── Node-to-node differences, and neighbours more alike than distant nodes.
const baselines = nodes.map((n) => engine.baselinesFor(n));
const distinctTemps = new Set(baselines.map((b) => b.temperature.toFixed(2))).size;
assert('nodes have distinct baselines', distinctTemps === nodes.length,
  `${distinctTemps} distinct of ${nodes.length}`);

const gap = (a, b) => Math.abs(baselines[a].soil_moisture - baselines[b].soil_moisture);
// Nodes 0 and 1 are adjacent in the grid; 0 and 11 are opposite corners.
assert('neighbouring nodes are more similar than distant ones', gap(0, 1) < gap(0, 11),
  `adjacent ${gap(0, 1).toFixed(2)} vs distant ${gap(0, 11).toFixed(2)}`);

// ── Anomaly injection pins the sensor and shows up as CRITICAL.
engine.injectAnomaly({ farmerId: 1, nodeId: node.node_id, sensor: 'nitrogen', value: 7, ticks: 5 });
const anomalous = engine.generateReading(node, state, new Date(start.getTime() + TICKS * 10000));
assert('injected anomaly pins the sensor', Math.abs(anomalous.nitrogen - 7) <= 1, `got ${anomalous.nitrogen}`);
assert('injected anomaly reads CRITICAL', evaluateReading(anomalous).health === STATUS.CRITICAL);
assert('injected anomaly turns the node red', evaluateReading(anomalous).colour === 'red');

// ── The anomaly expires and the node walks back to health.
for (let i = 0; i < 6; i += 1) {
  engine.generateReading(node, state, new Date(start.getTime() + (TICKS + i) * 10000));
}
const recovered = engine.generateReading(node, state, new Date(start.getTime() + (TICKS + 40) * 10000));
assert('anomaly expires and node recovers', evaluateReading(recovered).health === STATUS.GOOD,
  `got ${evaluateReading(recovered).health}`);

// ── Sample of the series, to eyeball smoothness.
console.log('\n  temperature over 2 minutes (12 ticks):');
console.log('   ', series.slice(4300, 4312).map((s) => s.reading.temperature.toFixed(1)).join('  '));
console.log('  soil moisture over 2 minutes:');
console.log('   ', series.slice(4300, 4312).map((s) => s.reading.soil_moisture).join('  '));

console.log(`\nsimulation realism: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
