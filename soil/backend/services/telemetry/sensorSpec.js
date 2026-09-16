/**
 * Sensor classification — the single source of truth for BharatGrow telemetry status.
 *
 * Ranges are transcribed verbatim from the FPGA sensor specification. Every
 * status shown on the Map, History, node panels and alerts comes from this file,
 * so a threshold is never restated anywhere else in the codebase.
 *
 * HOW THE LADDERS WORK
 * Each sensor is an ascending list of bands. A reading is matched against them in
 * order and takes the first band it falls into; the final band catches everything
 * above the last bound. Writing them as a ladder rather than as pairs of ranges
 * closes the gaps the spec leaves between bands — temperature, for instance,
 * lists BAD as 10–14.9 and AVERAGE as 15–19.9, which says nothing about 14.95.
 * The ladder assigns such a value to the band below, so no reading is unclassified.
 */

const STATUS = {
  GOOD: 'GOOD',
  AVERAGE: 'AVERAGE',
  BAD: 'BAD',
  CRITICAL: 'CRITICAL',
  INFORMATIONAL: 'INFORMATIONAL',
};

// CRITICAL > BAD > AVERAGE > GOOD, as required for node health rollup.
// INFORMATIONAL is deliberately absent: it must never influence node health.
const SEVERITY_ORDER = {
  [STATUS.GOOD]: 0,
  [STATUS.AVERAGE]: 1,
  [STATUS.BAD]: 2,
  [STATUS.CRITICAL]: 3,
};

/** `lt` = strictly less than, `lte` = less than or equal. */
const b = (kind, bound, status) => ({ kind, bound, status });

/**
 * Sensor definitions.
 *
 * classify: 'ladder'        numeric bands (above)
 *           'discrete'      exact value lookup (flame, PIR)
 *           'informational' recorded and displayed, never graded (rain)
 */
const SENSORS = {
  nitrogen: {
    key: 'nitrogen',
    label: 'Nitrogen',
    column: 'nitrogen',
    unit: 'mg/kg',
    decimals: 0,
    classify: 'ladder',
    // GOOD 40-80 | AVERAGE 20-39, 81-100 | BAD 10-19, 101-120 | CRITICAL <10, >120
    bands: [
      b('lt', 10, STATUS.CRITICAL),
      b('lt', 20, STATUS.BAD),
      b('lt', 40, STATUS.AVERAGE),
      b('lte', 80, STATUS.GOOD),
      b('lte', 100, STATUS.AVERAGE),
      b('lte', 120, STATUS.BAD),
    ],
    above: STATUS.CRITICAL,
  },

  phosphorus: {
    key: 'phosphorus',
    label: 'Phosphorus',
    column: 'phosphorus',
    unit: 'mg/kg',
    decimals: 0,
    classify: 'ladder',
    // GOOD 20-50 | AVERAGE 10-19, 51-70 | BAD 5-9, 71-90 | CRITICAL <5, >90
    bands: [
      b('lt', 5, STATUS.CRITICAL),
      b('lt', 10, STATUS.BAD),
      b('lt', 20, STATUS.AVERAGE),
      b('lte', 50, STATUS.GOOD),
      b('lte', 70, STATUS.AVERAGE),
      b('lte', 90, STATUS.BAD),
    ],
    above: STATUS.CRITICAL,
  },

  potassium: {
    key: 'potassium',
    label: 'Potassium',
    column: 'potassium',
    unit: 'mg/kg',
    decimals: 0,
    classify: 'ladder',
    // GOOD 40-100 | AVERAGE 20-39, 101-150 | BAD 10-19, 151-200 | CRITICAL <10, >200
    bands: [
      b('lt', 10, STATUS.CRITICAL),
      b('lt', 20, STATUS.BAD),
      b('lt', 40, STATUS.AVERAGE),
      b('lte', 100, STATUS.GOOD),
      b('lte', 150, STATUS.AVERAGE),
      b('lte', 200, STATUS.BAD),
    ],
    above: STATUS.CRITICAL,
  },

  soil_moisture: {
    key: 'soil_moisture',
    label: 'Soil Moisture',
    column: 'soil_moisture',
    unit: '%',
    decimals: 0,
    classify: 'ladder',
    // GOOD 55-80 | AVERAGE 40-54, 81-90 | BAD 20-39, 91-95 | CRITICAL <20, >95
    bands: [
      b('lt', 20, STATUS.CRITICAL),
      b('lt', 40, STATUS.BAD),
      b('lt', 55, STATUS.AVERAGE),
      b('lte', 80, STATUS.GOOD),
      b('lte', 90, STATUS.AVERAGE),
      b('lte', 95, STATUS.BAD),
    ],
    above: STATUS.CRITICAL,
  },

  temperature: {
    key: 'temperature',
    label: 'Temperature',
    column: 'temperature',
    unit: '°C',
    decimals: 1,
    classify: 'ladder',
    // GOOD 20-30 | AVERAGE 15-19.9, 30.1-35 | BAD 10-14.9, 35.1-40 | CRITICAL <10, >40
    bands: [
      b('lt', 10, STATUS.CRITICAL),
      b('lt', 15, STATUS.BAD),
      b('lt', 20, STATUS.AVERAGE),
      b('lte', 30, STATUS.GOOD),
      b('lte', 35, STATUS.AVERAGE),
      b('lte', 40, STATUS.BAD),
    ],
    above: STATUS.CRITICAL,
  },

  humidity: {
    key: 'humidity',
    label: 'Humidity',
    column: 'humidity',
    unit: '%',
    decimals: 0,
    classify: 'ladder',
    // GOOD 50-80 | AVERAGE 35-49, 81-85 | BAD 20-34, 86-95 | CRITICAL <20, >95
    bands: [
      b('lt', 20, STATUS.CRITICAL),
      b('lt', 35, STATUS.BAD),
      b('lt', 50, STATUS.AVERAGE),
      b('lte', 80, STATUS.GOOD),
      b('lte', 85, STATUS.AVERAGE),
      b('lte', 95, STATUS.BAD),
    ],
    above: STATUS.CRITICAL,
  },

  light: {
    key: 'light',
    label: 'Light',
    column: 'light',
    unit: 'lux',
    decimals: 0,
    classify: 'ladder',
    // GOOD 500-1500 | AVERAGE 300-499, 1501-2000 | BAD 100-299, 2001-3000 | CRITICAL <100, >3000
    bands: [
      b('lt', 100, STATUS.CRITICAL),
      b('lt', 300, STATUS.BAD),
      b('lt', 500, STATUS.AVERAGE),
      b('lte', 1500, STATUS.GOOD),
      b('lte', 2000, STATUS.AVERAGE),
      b('lte', 3000, STATUS.BAD),
    ],
    above: STATUS.CRITICAL,
  },

  water_level: {
    key: 'water_level',
    label: 'Water Level',
    column: 'water_level',
    unit: '%',
    decimals: 0,
    classify: 'ladder',
    // GOOD >=70 | AVERAGE 50-69 | BAD 30-49 | CRITICAL <30
    bands: [
      b('lt', 30, STATUS.CRITICAL),
      b('lt', 50, STATUS.BAD),
      b('lt', 70, STATUS.AVERAGE),
    ],
    above: STATUS.GOOD,
  },

  flame: {
    key: 'flame',
    label: 'Flame',
    column: 'flame',
    unit: '',
    decimals: 0,
    classify: 'discrete',
    // GOOD 0 | CRITICAL 1. No AVERAGE or BAD state exists for flame.
    states: { 0: STATUS.GOOD, 1: STATUS.CRITICAL },
    fallback: STATUS.CRITICAL,
    eventLike: true,
  },

  pir: {
    key: 'pir',
    label: 'Motion (PIR)',
    column: 'pir',
    unit: '',
    decimals: 0,
    classify: 'discrete',
    // GOOD 0 | AVERAGE 1. No BAD or CRITICAL state exists for PIR.
    states: { 0: STATUS.GOOD, 1: STATUS.AVERAGE },
    fallback: STATUS.AVERAGE,
    eventLike: true,
  },

  rain: {
    key: 'rain',
    label: 'Rain',
    column: 'rain',
    unit: 'mm',
    decimals: 1,
    classify: 'informational',
  },
};

/** Sensor keys in the order they should be displayed. */
const SENSOR_KEYS = Object.keys(SENSORS);

/** Sensors that contribute to node health. Excludes rain (informational). */
const GRADED_SENSOR_KEYS = SENSOR_KEYS.filter(
  (key) => SENSORS[key].classify !== 'informational'
);

/**
 * Classify one reading.
 * Returns INFORMATIONAL for rain and for any unknown sensor, and null values
 * stay null rather than being coerced into a status.
 */
function classify(sensorKey, value) {
  const spec = SENSORS[sensorKey];
  if (!spec) return STATUS.INFORMATIONAL;
  if (spec.classify === 'informational') return STATUS.INFORMATIONAL;
  if (value === null || value === undefined) return null;

  const num = Number(value);
  if (!Number.isFinite(num)) return null;

  if (spec.classify === 'discrete') {
    const key = String(Math.round(num));
    return spec.states[key] ?? spec.fallback;
  }

  for (const band of spec.bands) {
    if (band.kind === 'lt' && num < band.bound) return band.status;
    if (band.kind === 'lte' && num <= band.bound) return band.status;
  }
  return spec.above;
}

/**
 * Roll a full reading up into one node health status.
 *
 * CRITICAL > BAD > AVERAGE > GOOD. Rain is excluded. Sensors missing from the
 * reading are skipped rather than counted as GOOD, so a partial reading can
 * never make a node look healthier than its data supports.
 */
function evaluateReading(reading = {}) {
  const sensors = {};
  let worst = null;

  for (const key of GRADED_SENSOR_KEYS) {
    const value = reading[key];
    const status = classify(key, value);
    if (status === null) continue;

    sensors[key] = { key, label: SENSORS[key].label, value: Number(value), status, unit: SENSORS[key].unit };

    if (worst === null || SEVERITY_ORDER[status] > SEVERITY_ORDER[worst]) {
      worst = status;
    }
  }

  // Rain is reported alongside the graded sensors but never grades the node.
  if (reading.rain !== null && reading.rain !== undefined) {
    sensors.rain = {
      key: 'rain',
      label: SENSORS.rain.label,
      value: Number(reading.rain),
      status: STATUS.INFORMATIONAL,
      unit: SENSORS.rain.unit,
    };
  }

  const health = worst ?? STATUS.GOOD;

  return {
    health,
    // Map colour is derived here so the frontend cannot invent its own mapping.
    colour: health === STATUS.CRITICAL ? 'red'
      : (health === STATUS.BAD || health === STATUS.AVERAGE) ? 'yellow'
      : 'green',
    sensors,
    critical: Object.values(sensors).filter((s) => s.status === STATUS.CRITICAL),
  };
}

/** True when this reading has at least one CRITICAL graded sensor. */
function isCritical(reading) {
  return evaluateReading(reading).critical.length > 0;
}

module.exports = {
  STATUS,
  SEVERITY_ORDER,
  SENSORS,
  SENSOR_KEYS,
  GRADED_SENSOR_KEYS,
  classify,
  evaluateReading,
  isCritical,
};
