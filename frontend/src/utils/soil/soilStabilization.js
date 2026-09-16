/**
 * Soil stabilization — deterministic decision-support for Analyze/Results.
 *
 * Nutrient and moisture bands are transcribed from
 * `soil/backend/services/telemetry/sensorSpec.js` (the FPGA/app health ladders
 * already used on Map, History and alerts). pH bands reuse the existing ML
 * analysis tips in `ml_service/main.py` (`check_soil_health`).
 *
 * This module never invents readings. Missing numbers are skipped, not guessed.
 * It does not call Gemini and does not change the crop ML pipeline.
 */

export const SEVERITY_RANK = {
  CRITICAL: 4,
  HIGH: 3,
  MODERATE: 2,
  MAINTENANCE: 1,
};

/**
 * Conservative, single-place thresholds. Adjust here only.
 *
 * N/P/K/moisture GOOD windows match sensorSpec.js.
 * pH acidic/alkaline match Analysis improvement-tip logic (pH < 6.0 / > 7.5).
 */
export const STABILIZATION_THRESHOLDS = {
  n: {
    unit: 'mg/kg',
    goodMin: 40,
    goodMax: 80,
    // sensorSpec: CRITICAL <10, BAD <20, AVERAGE <40
    criticalBelow: 10,
    highBelow: 20,
  },
  p: {
    unit: 'mg/kg',
    goodMin: 20,
    goodMax: 50,
    criticalBelow: 5,
    highBelow: 10,
  },
  k: {
    unit: 'mg/kg',
    goodMin: 40,
    goodMax: 100,
    criticalBelow: 10,
    highBelow: 20,
  },
  moisture: {
    unit: '%',
    goodMin: 55,
    goodMax: 80,
    // low: sensorSpec CRITICAL <20, BAD <40, AVERAGE <55
    criticalBelow: 20,
    highBelow: 40,
    // high: AVERAGE 81–90, BAD 91–95, CRITICAL >95
    excessAbove: 80,
    highExcessAbove: 90,
    criticalExcessAbove: 95,
  },
  ph: {
    unit: '',
    // ml_service/main.py check_soil_health
    acidicBelow: 6.0,
    alkalineAbove: 7.5,
    // crop_explainer.py uses 5.5 for strongly acidic wording
    stronglyAcidicBelow: 5.5,
  },
};

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function lowSeverity(value, spec) {
  if (value < spec.criticalBelow) return 'CRITICAL';
  if (value < spec.highBelow) return 'HIGH';
  return 'MODERATE';
}

function highMoistureSeverity(value, spec) {
  if (value > spec.criticalExcessAbove) return 'CRITICAL';
  if (value > spec.highExcessAbove) return 'HIGH';
  return 'MODERATE';
}

function sortBySeverity(items) {
  return [...items].sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));
}

function rec(id, severity, issueIds, titleKey, bodyKey, whyKey) {
  return { id, severity, issueIds, titleKey, bodyKey, whyKey };
}

export function soilValuesFromAnalysis(source = {}) {
  const input = source.input || source;
  const features = source.crop_prediction?.features_received || source.features_received || {};
  return {
    n: num(input.n ?? input.nitrogen ?? features.N),
    p: num(input.p ?? input.phosphorus ?? features.P),
    k: num(input.k ?? input.potassium ?? features.K),
    ph: num(input.ph ?? features.ph),
    moisture: num(input.moisture ?? input.soil_moisture),
    temperature: num(input.temperature ?? features.temperature),
    humidity: num(input.humidity ?? features.humidity),
    rainfall: num(input.rainfall ?? features.rainfall),
  };
}

/**
 * Label the origin of the readings. Farm-node telemetry in Analyze is simulated
 * software telemetry, not ESP32 Hardware Beta.
 */
export function stabilizationSourceKind({ usingSensors, telemetrySnapshot, hardware } = {}) {
  if (hardware) return 'hardware';
  if (usingSensors || telemetrySnapshot) return 'simulated';
  return 'measurements';
}

export function getSoilStabilizationRecommendations(soilData = {}, options = {}) {
  const values = soilValuesFromAnalysis(soilData);
  const T = STABILIZATION_THRESHOLDS;
  const issues = [];

  if (values.n != null && values.n < T.n.goodMin) {
    issues.push({
      id: 'low_n',
      param: 'n',
      severity: lowSeverity(values.n, T.n),
      value: values.n,
      unit: T.n.unit,
      range: [T.n.goodMin, T.n.goodMax],
      labelKey: 'pg_stab_low_n',
    });
  }
  if (values.p != null && values.p < T.p.goodMin) {
    issues.push({
      id: 'low_p',
      param: 'p',
      severity: lowSeverity(values.p, T.p),
      value: values.p,
      unit: T.p.unit,
      range: [T.p.goodMin, T.p.goodMax],
      labelKey: 'pg_stab_low_p',
    });
  }
  if (values.k != null && values.k < T.k.goodMin) {
    issues.push({
      id: 'low_k',
      param: 'k',
      severity: lowSeverity(values.k, T.k),
      value: values.k,
      unit: T.k.unit,
      range: [T.k.goodMin, T.k.goodMax],
      labelKey: 'pg_stab_low_k',
    });
  }
  if (values.ph != null && values.ph < T.ph.acidicBelow) {
    issues.push({
      id: 'acidic',
      param: 'ph',
      severity: values.ph < T.ph.stronglyAcidicBelow ? 'HIGH' : 'MODERATE',
      value: values.ph,
      unit: T.ph.unit,
      range: [T.ph.acidicBelow, T.ph.alkalineAbove],
      labelKey: 'pg_stab_acidic',
    });
  } else if (values.ph != null && values.ph > T.ph.alkalineAbove) {
    issues.push({
      id: 'alkaline',
      param: 'ph',
      severity: 'MODERATE',
      value: values.ph,
      unit: T.ph.unit,
      range: [T.ph.acidicBelow, T.ph.alkalineAbove],
      labelKey: 'pg_stab_alkaline',
    });
  }
  if (values.moisture != null && values.moisture < T.moisture.goodMin) {
    issues.push({
      id: 'low_moisture',
      param: 'moisture',
      severity: lowSeverity(values.moisture, T.moisture),
      value: values.moisture,
      unit: T.moisture.unit,
      range: [T.moisture.goodMin, T.moisture.goodMax],
      labelKey: 'pg_stab_low_moist',
    });
  } else if (values.moisture != null && values.moisture > T.moisture.excessAbove) {
    const excessId = values.moisture > T.moisture.highExcessAbove ? 'waterlogging_risk' : 'excess_moisture';
    issues.push({
      id: excessId,
      param: 'moisture',
      severity: highMoistureSeverity(values.moisture, T.moisture),
      value: values.moisture,
      unit: T.moisture.unit,
      range: [T.moisture.goodMin, T.moisture.goodMax],
      labelKey: excessId === 'waterlogging_risk' ? 'pg_stab_waterlog' : 'pg_stab_excess_moist',
    });
  }

  const rankedIssues = sortBySeverity(issues);
  const recs = [];
  const seen = new Set();
  const add = (item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    recs.push(item);
  };

  for (const issue of rankedIssues) {
    if (issue.id === 'low_n') {
      add(rec('organic_n', issue.severity, [issue.id], 'pg_stab_act_organic', 'pg_stab_act_organic_d', 'pg_stab_why_n'));
    }
    if (issue.id === 'low_p') {
      add(rec('phos', issue.severity, [issue.id], 'pg_stab_act_p', 'pg_stab_act_p_d', 'pg_stab_why_p'));
    }
    if (issue.id === 'low_k') {
      add(rec('potash', issue.severity, [issue.id], 'pg_stab_act_k', 'pg_stab_act_k_d', 'pg_stab_why_k'));
    }
    if (issue.id === 'acidic') {
      add(rec('lime', issue.severity, [issue.id], 'pg_stab_act_lime', 'pg_stab_act_lime_d', 'pg_stab_why_acid'));
    }
    if (issue.id === 'alkaline') {
      add(rec('alkaline_om', issue.severity, [issue.id], 'pg_stab_act_alkaline', 'pg_stab_act_alkaline_d', 'pg_stab_why_alkaline'));
    }
    if (issue.id === 'low_moisture') {
      add(rec('irrigate', issue.severity, [issue.id], 'pg_stab_act_moist', 'pg_stab_act_moist_d', 'pg_stab_why_moist'));
    }
    if (issue.id === 'excess_moisture' || issue.id === 'waterlogging_risk') {
      add(rec('drain', issue.severity, [issue.id], 'pg_stab_act_drain', 'pg_stab_act_drain_d', 'pg_stab_why_wet'));
    }
  }

  if (rankedIssues.length) {
    add(rec('retest', 'MAINTENANCE', rankedIssues.map((i) => i.id), 'pg_stab_act_retest', 'pg_stab_act_retest_d', 'pg_stab_why_retest'));
  }

  const maintenanceTips = rankedIssues.length
    ? []
    : [
      rec('maintain_om', 'MAINTENANCE', [], 'pg_stab_mnt_om', 'pg_stab_mnt_om_d', 'pg_stab_why_stable'),
      rec('maintain_water', 'MAINTENANCE', [], 'pg_stab_mnt_water', 'pg_stab_mnt_water_d', 'pg_stab_why_stable'),
      rec('maintain_test', 'MAINTENANCE', [], 'pg_stab_act_retest', 'pg_stab_act_retest_d', 'pg_stab_why_stable'),
      rec('maintain_balance', 'MAINTENANCE', [], 'pg_stab_mnt_balance', 'pg_stab_mnt_balance_d', 'pg_stab_why_stable'),
    ];

  const hasValue = ['n', 'p', 'k', 'ph', 'moisture'].some((key) => values[key] != null);
  const overallStatus = !hasValue
    ? 'empty'
    : (rankedIssues.length ? 'needs_attention' : 'stable');

  return {
    overallStatus,
    values,
    issues: rankedIssues,
    recommendations: sortBySeverity(recs),
    maintenanceTips,
    sourceKind: stabilizationSourceKind(options),
    comparison: compareWithPrevious(values, options.previous),
  };
}

function issueIdsFor(values) {
  return getSoilStabilizationRecommendations(values).issues.map((i) => i.id);
}

function movedTowardGood(param, prev, curr) {
  const spec = STABILIZATION_THRESHOLDS[param];
  if (!spec || prev == null || curr == null) return null;
  if (param === 'ph') {
    const mid = (spec.acidicBelow + spec.alkalineAbove) / 2;
    return Math.abs(curr - mid) < Math.abs(prev - mid) - 0.05;
  }
  if (curr >= spec.goodMin && curr <= spec.goodMax && !(prev >= spec.goodMin && prev <= spec.goodMax)) {
    return true;
  }
  if (curr < spec.goodMin && prev < spec.goodMin) return curr > prev;
  if (param === 'moisture' && curr > spec.excessAbove && prev > spec.excessAbove) return curr < prev;
  return null;
}

export function compareWithPrevious(current, previous) {
  if (!previous) return null;
  const prevVals = soilValuesFromAnalysis(previous);
  const keys = ['n', 'p', 'k', 'ph', 'moisture'];
  const snapshot = {};
  let improved = 0;
  let worsened = 0;
  let compared = 0;
  keys.forEach((key) => {
    if (current[key] == null || prevVals[key] == null) return;
    snapshot[key] = { current: current[key], previous: prevVals[key] };
    compared += 1;
    const better = movedTowardGood(key, prevVals[key], current[key]);
    if (better === true) improved += 1;
    if (better === false) worsened += 1;
    if (better == null && current[key] < prevVals[key] && current[key] < (STABILIZATION_THRESHOLDS[key]?.goodMin ?? 0)) {
      worsened += 1;
    }
  });
  if (!compared) return null;
  const prevIssueCount = issueIdsFor(prevVals).length;
  const currIssueCount = issueIdsFor(current).length;
  if (improved > worsened && improved > 0 && currIssueCount <= prevIssueCount) {
    return { kind: 'improving', ...snapshot };
  }
  return { kind: null, ...snapshot };
}
