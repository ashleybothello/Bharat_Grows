/**
 * Compact farm snapshot for SAATHI.
 *
 * Pulls from the same stores the Map, History, Analyze and Market pages use.
 * Never includes credentials, tokens, phone numbers or API keys.
 */

const farmerStore = require('../farmerStore');
const store = require('../telemetry/telemetryStore');
const { evaluateReading, SENSORS } = require('../telemetry/sensorSpec');
const marketService = require('../market/marketService');

function round(value, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function readingFromRow(row) {
  if (!row) return null;
  const reading = {};
  let present = false;
  for (const key of store.READING_COLUMNS) {
    if (row[key] === null || row[key] === undefined) {
      reading[key] = null;
    } else {
      reading[key] = Number(row[key]);
      present = true;
    }
  }
  return present ? reading : null;
}

function compactSensors(evaluation) {
  const out = {};
  for (const [key, item] of Object.entries(evaluation?.sensors || {})) {
    const spec = SENSORS[key] || {};
    out[key] = {
      value: round(item.value, spec.decimals == null ? 1 : spec.decimals),
      unit: item.unit || spec.unit || '',
      status: item.status,
    };
  }
  return out;
}

function compactNode(row) {
  const reading = readingFromRow(row);
  const evaluation = reading ? evaluateReading(reading) : null;
  return {
    nodeId: row.node_id,
    nodeNumber: Number(row.node_number),
    zone: row.zone || null,
    health: evaluation?.health || null,
    lastReadingAt: row.recorded_at || null,
    sensors: compactSensors(evaluation),
    criticalSensors: (evaluation?.critical || []).map((item) => ({
      key: item.key,
      label: item.label,
      value: round(item.value, SENSORS[item.key]?.decimals ?? 1),
      unit: item.unit,
    })),
  };
}

function parseCrops(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item) => String(item)).filter(Boolean).slice(0, 8);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean).slice(0, 8);
  } catch {
    /* stored as a plain string */
  }
  return String(raw).split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

async function latestAnalysis() {
  if (!store.dbEnabled()) return null;
  try {
    const { pool } = require('../../db');
    const result = await pool.query(`
      SELECT
        p.id as prediction_id,
        s.n, s.p, s.k, s.ph, s.moisture, s.temperature, s.humidity, s.rainfall,
        p.soil_quality, p.recommended_crops, p.improvement_tips, p.created_at
      FROM predictions p
      JOIN soil_data s ON p.soil_id = s.id
      ORDER BY p.created_at DESC
      LIMIT 1;
    `);
    const row = result.rows[0];
    if (!row) return null;
    return {
      at: row.created_at,
      source: 'ML crop model (Analyze → Results)',
      soilQuality: row.soil_quality || null,
      nitrogen: row.n == null ? null : Number(row.n),
      phosphorus: row.p == null ? null : Number(row.p),
      potassium: row.k == null ? null : Number(row.k),
      ph: row.ph == null ? null : Number(row.ph),
      moisture: row.moisture == null ? null : Number(row.moisture),
      temperature: row.temperature == null ? null : Number(row.temperature),
      humidity: row.humidity == null ? null : Number(row.humidity),
      rainfallMm: row.rainfall == null ? null : Number(row.rainfall),
      recommendedCrops: parseCrops(row.recommended_crops),
      improvementTips: row.improvement_tips || null,
    };
  } catch (err) {
    console.error('[saathi] latest analysis:', err.message);
    return null;
  }
}

async function marketSummary(farmer) {
  try {
    const profile = farmer?.profile || {};
    const data = await marketService.getSummary({
      state: profile.state || '',
      district: profile.district || '',
      pin: profile.primaryCrop || '',
    });
    const crops = (data.commodities || []).slice(0, 8).map((row) => ({
      commodity: row.commodity,
      market: row.market,
      state: row.state,
      district: row.district,
      date: row.date,
      modalPrice: row.modalPrice,
      unit: row.unit || data.unit || '₹/quintal',
      changePercent: row.changePercent,
    }));
    return {
      source: data.source || 'Government OGD / AGMARKNET',
      lastUpdated: data.lastUpdated || null,
      available: crops.length > 0,
      crops,
    };
  } catch (err) {
    console.error('[saathi] market summary:', err.message);
    return { source: 'Government OGD / AGMARKNET', available: false, lastUpdated: null, crops: [] };
  }
}

function publicProfile(farmer) {
  if (!farmer) return null;
  const profile = farmer.profile && typeof farmer.profile === 'object' ? farmer.profile : {};
  return {
    name: farmer.name || profile.fullName || null,
    village: farmer.village || profile.village || null,
    district: profile.district || null,
    state: profile.state || null,
    farmName: profile.farmName || null,
    farmSize: profile.farmSize || null,
    farmSizeUnit: profile.farmSizeUnit || null,
    primaryCrop: profile.primaryCrop || null,
    soilType: profile.soilType || null,
  };
}

function pickNode(nodes, hint) {
  if (!nodes.length) return null;
  const raw = hint == null ? '' : String(hint);
  const match = raw.match(/(\d{1,3})/);
  if (match) {
    const num = Number(match[1]);
    const found = nodes.find((node) => node.nodeNumber === num);
    if (found) return found;
  }
  const critical = nodes.find((node) => node.health === 'CRITICAL');
  return critical || nodes[0];
}

/**
 * Build the compact object that goes into the SAATHI system prompt.
 */
async function buildFarmContext(farmer, { message = '', clientContext = null } = {}) {
  const profile = publicProfile(farmer);
  const telemetrySource = 'SIMULATED software-demo telemetry (not physical ESP32 hardware). Status uses the existing BharatGrow sensor classification: GOOD, AVERAGE, BAD, CRITICAL.';

  let nodes = [];
  let anomalies = [];
  if (farmer?.id && store.dbEnabled()) {
    try {
      const rows = await store.latestPerNode(farmer.id);
      nodes = rows.map(compactNode);
    } catch (err) {
      console.error('[saathi] nodes:', err.message);
    }
    try {
      const pack = await store.anomalyHistory({ farmerId: farmer.id, limit: 8 });
      anomalies = (pack.rows || []).map((row) => ({
        nodeId: row.node_id,
        nodeNumber: row.node_number,
        zone: row.zone,
        sensor: row.sensor,
        value: row.value == null ? null : Number(row.value),
        severity: row.severity,
        detectedAt: row.detected_at,
      }));
    } catch (err) {
      console.error('[saathi] anomalies:', err.message);
    }
  }

  const tally = { GOOD: 0, AVERAGE: 0, BAD: 0, CRITICAL: 0, UNKNOWN: 0 };
  const criticalList = [];
  for (const node of nodes) {
    tally[node.health || 'UNKNOWN'] += 1;
    for (const item of node.criticalSensors || []) {
      criticalList.push({
        nodeNumber: node.nodeNumber,
        ...item,
      });
    }
  }

  const selectedNode = pickNode(nodes, message);
  let [analysis, market] = await Promise.all([latestAnalysis(), marketSummary(farmer)]);

  const session = clientContext && typeof clientContext === 'object'
    ? (clientContext.latestAnalysis || clientContext)
    : null;
  const sessionCrop = session?.crop_prediction || clientContext?.crop_prediction;
  const sessionRain = session?.rainfall_intelligence || clientContext?.rainfall_intelligence;
  if (sessionCrop?.recommended_crop) {
    const top = (sessionCrop.top_crops || []).map((row) => row.crop).filter(Boolean);
    analysis = {
      ...(analysis || {}),
      at: session?.at || analysis?.at,
      source: 'ML crop model (Analyze → Results)',
      recommendedCrops: [sessionCrop.recommended_crop, ...top]
        .filter((name, idx, arr) => name && arr.indexOf(name) === idx)
        .slice(0, 8),
      cropPrediction: sessionCrop,
      rainfallIntelligence: sessionRain || null,
      rainfallFeature: session?.rainfall_feature || analysis?.rainfallMm,
      nodeId: session?.nodeId || null,
      nitrogen: sessionCrop.features_received?.N ?? analysis?.nitrogen,
      phosphorus: sessionCrop.features_received?.P ?? analysis?.phosphorus,
      potassium: sessionCrop.features_received?.K ?? analysis?.potassium,
      ph: sessionCrop.features_received?.ph ?? analysis?.ph,
      temperature: sessionCrop.features_received?.temperature ?? analysis?.temperature,
      humidity: sessionCrop.features_received?.humidity ?? analysis?.humidity,
    };
  }

  const liveTemps = nodes
    .map((node) => node.sensors?.temperature)
    .filter((item) => item && item.value != null);
  const weather = liveTemps.length
    ? {
        source: 'Farm telemetry temperature (simulated demo reading)',
        temperatureC: liveTemps[0].value,
        status: liveTemps[0].status,
      }
    : { source: null, temperatureC: null, status: null };

  const rainfallPrediction = sessionRain
    ? {
        rainfallTodayMm: sessionRain.rainfall_today_mm,
        rainfallNext24hMm: sessionRain.rainfall_next_24h_mm,
        rainfallNext3DaysMm: sessionRain.rainfall_next_3_days_mm,
        trend: sessionRain.rainfall_trend,
        source: sessionRain.method?.forecast_source || 'Open-Meteo (CC-BY-4.0)',
        type: sessionRain.method?.type || 'rule-based analysis — NOT a trained rainfall model',
      }
    : analysis?.rainfallMm != null
      ? { rainfallMm: analysis.rainfallMm, source: 'Last Analyze crop-model rainfall feature (mm)' }
      : null;

  return {
    product: 'BharatGrow',
    assistant: 'SAATHI',
    telemetrySource,
    farmer: profile,
    farm: farmer ? {
      farmName: profile?.farmName || null,
      size: profile?.farmSize ? `${profile.farmSize} ${profile.farmSizeUnit || ''}`.trim() : null,
      nodeCount: nodes.length,
      tally,
    } : null,
    nodes: nodes.map((node) => ({
      nodeNumber: node.nodeNumber,
      zone: node.zone,
      health: node.health,
      lastReadingAt: node.lastReadingAt,
      sensors: node.sensors,
      criticalSensors: node.criticalSensors,
    })),
    selectedNode: selectedNode ? {
      nodeNumber: selectedNode.nodeNumber,
      zone: selectedNode.zone,
      health: selectedNode.health,
      lastReadingAt: selectedNode.lastReadingAt,
      sensors: selectedNode.sensors,
      criticalSensors: selectedNode.criticalSensors,
    } : null,
    criticalSensors: criticalList.slice(0, 12),
    recentAnomalies: anomalies,
    latestAnalysis: analysis,
    cropRecommendation: analysis?.recommendedCrops?.length
      ? { crops: analysis.recommendedCrops, source: analysis.source, soilQuality: analysis.soilQuality }
      : null,
    rainfallPrediction,
    marketSummary: market,
    weather,
    clientContext: clientContext && typeof clientContext === 'object'
      ? {
          soil_quality: clientContext.soil_quality || null,
          recommended_crops: parseCrops(clientContext.recommended_crops),
          n: clientContext.n ?? null,
          p: clientContext.p ?? null,
          k: clientContext.k ?? null,
          crop_prediction: clientContext.crop_prediction || clientContext.latestAnalysis?.crop_prediction || null,
          rainfall_intelligence: clientContext.rainfall_intelligence || clientContext.latestAnalysis?.rainfall_intelligence || null,
          ui: clientContext.ui || null,
        }
      : null,
    ui: clientContext?.ui || null,
  };
}

async function farmerFromRequest(req) {
  const header = String(req.headers.authorization || '');
  const token = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : String(req.headers['x-session-token'] || '').trim();
  if (!token) return null;
  const phone = farmerStore.phoneFromToken(token);
  if (!phone) return null;
  return farmerStore.findByPhone(phone);
}

module.exports = {
  buildFarmContext,
  farmerFromRequest,
};
