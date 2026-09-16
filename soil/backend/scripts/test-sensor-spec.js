/**
 * Boundary tests for services/telemetry/sensorSpec.js.
 *
 * Every case is taken straight from the FPGA sensor specification, including
 * both edges of each band, so a future threshold edit cannot silently drift.
 *
 *   node scripts/test-sensor-spec.js
 */

const { classify, evaluateReading, STATUS } = require('../services/telemetry/sensorSpec');

let pass = 0;
let fail = 0;

function check(sensor, value, expected) {
  const actual = classify(sensor, value);
  if (actual === expected) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`  FAIL ${sensor}=${value} expected ${expected}, got ${actual}`);
  }
}

// --- Nitrogen: GOOD 40-80 | AVG 20-39, 81-100 | BAD 10-19, 101-120 | CRIT <10, >120
check('nitrogen', 9, STATUS.CRITICAL);
check('nitrogen', 10, STATUS.BAD);
check('nitrogen', 19, STATUS.BAD);
check('nitrogen', 20, STATUS.AVERAGE);
check('nitrogen', 39, STATUS.AVERAGE);
check('nitrogen', 40, STATUS.GOOD);
check('nitrogen', 80, STATUS.GOOD);
check('nitrogen', 81, STATUS.AVERAGE);
check('nitrogen', 100, STATUS.AVERAGE);
check('nitrogen', 101, STATUS.BAD);
check('nitrogen', 120, STATUS.BAD);
check('nitrogen', 121, STATUS.CRITICAL);
check('nitrogen', 7, STATUS.CRITICAL); // the demo anomaly value from the brief

// --- Phosphorus: GOOD 20-50 | AVG 10-19, 51-70 | BAD 5-9, 71-90 | CRIT <5, >90
check('phosphorus', 4, STATUS.CRITICAL);
check('phosphorus', 5, STATUS.BAD);
check('phosphorus', 9, STATUS.BAD);
check('phosphorus', 10, STATUS.AVERAGE);
check('phosphorus', 19, STATUS.AVERAGE);
check('phosphorus', 20, STATUS.GOOD);
check('phosphorus', 50, STATUS.GOOD);
check('phosphorus', 51, STATUS.AVERAGE);
check('phosphorus', 70, STATUS.AVERAGE);
check('phosphorus', 71, STATUS.BAD);
check('phosphorus', 90, STATUS.BAD);
check('phosphorus', 91, STATUS.CRITICAL);

// --- Potassium: GOOD 40-100 | AVG 20-39, 101-150 | BAD 10-19, 151-200 | CRIT <10, >200
check('potassium', 9, STATUS.CRITICAL);
check('potassium', 10, STATUS.BAD);
check('potassium', 20, STATUS.AVERAGE);
check('potassium', 40, STATUS.GOOD);
check('potassium', 100, STATUS.GOOD);
check('potassium', 101, STATUS.AVERAGE);
check('potassium', 150, STATUS.AVERAGE);
check('potassium', 151, STATUS.BAD);
check('potassium', 200, STATUS.BAD);
check('potassium', 201, STATUS.CRITICAL);

// --- Soil moisture: GOOD 55-80 | AVG 40-54, 81-90 | BAD 20-39, 91-95 | CRIT <20, >95
check('soil_moisture', 19, STATUS.CRITICAL);
check('soil_moisture', 20, STATUS.BAD);
check('soil_moisture', 39, STATUS.BAD);
check('soil_moisture', 40, STATUS.AVERAGE);
check('soil_moisture', 54, STATUS.AVERAGE);
check('soil_moisture', 55, STATUS.GOOD);
check('soil_moisture', 80, STATUS.GOOD);
check('soil_moisture', 81, STATUS.AVERAGE);
check('soil_moisture', 90, STATUS.AVERAGE);
check('soil_moisture', 91, STATUS.BAD);
check('soil_moisture', 95, STATUS.BAD);
check('soil_moisture', 96, STATUS.CRITICAL);

// --- Temperature: GOOD 20-30 | AVG 15-19.9, 30.1-35 | BAD 10-14.9, 35.1-40 | CRIT <10, >40
check('temperature', 9.9, STATUS.CRITICAL);
check('temperature', 10, STATUS.BAD);
check('temperature', 14.9, STATUS.BAD);
check('temperature', 15, STATUS.AVERAGE);
check('temperature', 19.9, STATUS.AVERAGE);
check('temperature', 20, STATUS.GOOD);
check('temperature', 28.1, STATUS.GOOD);
check('temperature', 30, STATUS.GOOD);
check('temperature', 30.1, STATUS.AVERAGE);
check('temperature', 34.1, STATUS.AVERAGE);
check('temperature', 35, STATUS.AVERAGE);
check('temperature', 35.1, STATUS.BAD);
check('temperature', 40, STATUS.BAD);
check('temperature', 40.1, STATUS.CRITICAL);

// --- Humidity: GOOD 50-80 | AVG 35-49, 81-85 | BAD 20-34, 86-95 | CRIT <20, >95
check('humidity', 19, STATUS.CRITICAL);
check('humidity', 20, STATUS.BAD);
check('humidity', 34, STATUS.BAD);
check('humidity', 35, STATUS.AVERAGE);
check('humidity', 49, STATUS.AVERAGE);
check('humidity', 50, STATUS.GOOD);
check('humidity', 80, STATUS.GOOD);
check('humidity', 81, STATUS.AVERAGE);
check('humidity', 85, STATUS.AVERAGE);
check('humidity', 86, STATUS.BAD);
check('humidity', 95, STATUS.BAD);
check('humidity', 96, STATUS.CRITICAL);

// --- Light: GOOD 500-1500 | AVG 300-499, 1501-2000 | BAD 100-299, 2001-3000 | CRIT <100, >3000
check('light', 99, STATUS.CRITICAL);
check('light', 100, STATUS.BAD);
check('light', 299, STATUS.BAD);
check('light', 300, STATUS.AVERAGE);
check('light', 499, STATUS.AVERAGE);
check('light', 500, STATUS.GOOD);
check('light', 920, STATUS.GOOD);
check('light', 1500, STATUS.GOOD);
check('light', 1501, STATUS.AVERAGE);
check('light', 2000, STATUS.AVERAGE);
check('light', 2001, STATUS.BAD);
check('light', 3000, STATUS.BAD);
check('light', 3001, STATUS.CRITICAL);

// --- Water level: GOOD >=70 | AVG 50-69 | BAD 30-49 | CRIT <30
check('water_level', 29, STATUS.CRITICAL);
check('water_level', 30, STATUS.BAD);
check('water_level', 49, STATUS.BAD);
check('water_level', 50, STATUS.AVERAGE);
check('water_level', 69, STATUS.AVERAGE);
check('water_level', 70, STATUS.GOOD);
check('water_level', 74, STATUS.GOOD);
check('water_level', 100, STATUS.GOOD);

// --- Flame: GOOD 0 | CRITICAL 1 (no AVERAGE/BAD)
check('flame', 0, STATUS.GOOD);
check('flame', 1, STATUS.CRITICAL);

// --- PIR: GOOD 0 | AVERAGE 1 (no BAD/CRITICAL)
check('pir', 0, STATUS.GOOD);
check('pir', 1, STATUS.AVERAGE);

// --- Rain is informational and never graded
check('rain', 0, STATUS.INFORMATIONAL);
check('rain', 12, STATUS.INFORMATIONAL);
check('rain', 999, STATUS.INFORMATIONAL);

// --- Node health rollup: CRITICAL > BAD > AVERAGE > GOOD
function checkHealth(name, reading, expectedHealth, expectedColour) {
  const result = evaluateReading(reading);
  const ok = result.health === expectedHealth && result.colour === expectedColour;
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`  FAIL health/${name}: expected ${expectedHealth}/${expectedColour}, got ${result.health}/${result.colour}`);
  }
}

const healthy = {
  nitrogen: 48, phosphorus: 32, potassium: 64, soil_moisture: 61,
  temperature: 28.1, humidity: 67, light: 920, water_level: 74,
  flame: 0, pir: 0, rain: 12,
};

checkHealth('all good', healthy, STATUS.GOOD, 'green');
checkHealth('one average', { ...healthy, temperature: 34.1 }, STATUS.AVERAGE, 'yellow');
checkHealth('one bad', { ...healthy, humidity: 90 }, STATUS.BAD, 'yellow');
checkHealth('one critical', { ...healthy, nitrogen: 7 }, STATUS.CRITICAL, 'red');
checkHealth('critical beats bad', { ...healthy, nitrogen: 7, humidity: 90 }, STATUS.CRITICAL, 'red');
checkHealth('flame critical', { ...healthy, flame: 1 }, STATUS.CRITICAL, 'red');
checkHealth('pir only is average', { ...healthy, pir: 1 }, STATUS.AVERAGE, 'yellow');
// Extreme rain must not drag node health down.
checkHealth('heavy rain stays good', { ...healthy, rain: 450 }, STATUS.GOOD, 'green');

// Partial readings must not be graded as GOOD for absent sensors.
const partial = evaluateReading({ nitrogen: 7 });
if (partial.health === STATUS.CRITICAL && Object.keys(partial.sensors).length === 1) {
  pass += 1;
} else {
  fail += 1;
  console.log('  FAIL partial reading handling');
}

console.log(`\nsensorSpec: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
