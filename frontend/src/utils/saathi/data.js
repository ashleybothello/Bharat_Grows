import { API_URL, requestRainfallIntelligence } from '../api';
import { fetchMarketCrop, fetchMarketHistory, fetchMarketTrends } from '../market';
import { readLatestAnalysis } from '../latestAnalysis';
import {
  fetchAnomalies,
  fetchNode,
  fetchNodes,
  fetchTelemetryTrends,
} from '../telemetry';
import { agriForPlace, findPlace } from './places';

const SOIL_KEYS = ['soil_moisture', 'temperature', 'humidity'];
const NUTRIENT_KEYS = ['nitrogen', 'phosphorus', 'potassium'];
const TREND_KEYS = ['soil_moisture', 'temperature', 'nitrogen'];

function nodeFromPack(pack, number) {
  const nodes = pack?.nodes || pack?.data?.nodes || [];
  return nodes.find((n) => Number(n.nodeNumber) === Number(number)) || null;
}

function roundStat(n) {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 10) / 10;
}

function trendStats(points) {
  const values = (points || [])
    .map((p) => Number(p.value ?? p.avg ?? p.mean ?? p.v))
    .filter((n) => Number.isFinite(n));
  if (!values.length) return null;
  const first = values[0];
  const last = values[values.length - 1];
  return {
    min: roundStat(Math.min(...values)),
    max: roundStat(Math.max(...values)),
    first: roundStat(first),
    last: roundStat(last),
    delta: roundStat(last - first),
    count: values.length,
  };
}

async function loadNode(plan, results) {
  const fromAction = (results || []).find((row) => row.nodeId && row.ok);
  let nodeId = fromAction?.nodeId || plan.nodeId;
  let nodeNumber = fromAction?.nodeNumber || plan.nodeNumber;
  let pack = null;
  try {
    pack = await fetchNodes();
  } catch {
    pack = null;
  }
  if (!nodeId && nodeNumber != null) {
    const found = nodeFromPack(pack, nodeNumber);
    nodeId = found?.nodeId;
  }
  if (!nodeId) {
    return { ok: false, error: 'missing_node', nodeNumber, pack };
  }
  let detail = null;
  try {
    detail = await fetchNode(nodeId);
  } catch {
    detail = null;
  }
  const node = detail?.node || detail || nodeFromPack(pack, nodeNumber);
  if (!node) {
    if (fromAction?.ok) return { ok: false, error: 'fetch_failed', nodeNumber: nodeNumber || fromAction.nodeNumber };
    return { ok: false, error: 'missing_node', nodeNumber, pack };
  }
  let anomalies = [];
  try {
    const events = await fetchAnomalies({ limit: 20, nodeId: node.nodeId });
    anomalies = events.rows || events.anomalies || [];
  } catch {
    anomalies = [];
  }
  return { ok: true, node, pack, anomalies, nodeNumber: node.nodeNumber };
}

export async function getSaathiData(plan, results = [], extras = {}) {
  const intent = plan?.intent;

  if (intent === 'NODE_INFO' || intent === 'NODE_SELECT') {
    const loaded = await loadNode(plan, results);
    if (!loaded.ok) return loaded;
    return { ...loaded, sensorKey: plan.sensorKey || null };
  }

  if (intent === 'NODE_HISTORY' || intent === 'HISTORY') {
    const loaded = await loadNode(plan, results);
    if (!loaded.ok) return loaded;
    const range = plan.range || '1d';
    const trends = {};
    await Promise.all(TREND_KEYS.map(async (sensor) => {
      try {
        const series = await fetchTelemetryTrends({
          sensor,
          range,
          nodeId: loaded.node.nodeId,
        });
        trends[sensor] = trendStats(series?.points || series?.data || []);
        trends[`${sensor}_points`] = (series?.points || []).length;
      } catch {
        trends[sensor] = null;
      }
    }));
    return { ...loaded, range, trends };
  }

  if (intent === 'GIS_SOIL_INFO' || intent === 'GIS_CROP_INFO' || intent === 'GIS_SOIL_SEARCH' || intent === 'GIS_CROP_SEARCH') {
    const gis = (results || []).find((row) => row.agri || row.iso || row.name);
    const place = plan.place || (gis?.iso ? { iso: gis.iso, name: gis.name } : null)
      || findPlace(plan.district?.state || '');
    const agri = gis?.agri || plan.agri || agriForPlace(place);
    if (!place && !plan.district) {
      return { ok: false, error: 'missing_region' };
    }
    if (!agri) {
      return { ok: false, error: 'no_agri', place, district: plan.district };
    }
    return { ok: true, place, district: plan.district, agri };
  }

  if (intent === 'MARKET_INFO' || intent === 'MARKET_QUERY') {
    const price = (results || []).find((row) => row.type === 'showMarketPrice' || row.type === 'showMarketTrend');
    let payload = price?.data || null;
    const commodity = price?.commodity || plan.crop;
    const state = price?.state || plan.place?.name || '';
    const district = plan.district?.name || '';
    if (!payload && commodity) {
      try {
        const fetched = await fetchMarketCrop(commodity, { state, district, sort: 'highest' });
        payload = fetched.ok ? fetched.data : null;
        if (!fetched.ok) {
          return { ok: false, error: 'market_unavailable', commodity, state };
        }
      } catch {
        return { ok: false, error: 'market_unavailable', commodity, state };
      }
    }
    if (!commodity) {
      return { ok: false, error: 'market_unavailable', commodity: '', state };
    }
    if (!payload) {
      return { ok: false, error: 'market_unavailable', commodity, state };
    }
    let history = null;
    if (plan.yesterday && commodity) {
      try {
        const hist = await fetchMarketHistory(commodity, { state, district });
        history = hist.ok ? hist.data : null;
      } catch {
        history = null;
      }
    }
    let trend = price?.trend || null;
    if (!trend && commodity && (plan.range || price?.type === 'showMarketTrend')) {
      try {
        const trendRes = await fetchMarketTrends({ commodity, state, district, range: plan.range || '7d' });
        trend = trendRes.ok ? trendRes.data : null;
      } catch {
        trend = null;
      }
    }
    return {
      ok: payload.success !== false,
      commodity,
      state,
      district,
      payload,
      history,
      trend,
      yesterday: Boolean(plan.yesterday),
    };
  }

  if (intent === 'RUN_ANALYSIS' || intent === 'ANALYSIS_INFO' || intent === 'CROP_RECOMMENDATION') {
    const ran = (results || []).find((row) => row.type === 'runAnalysis');
    const analysis = readLatestAnalysis();
    if (!analysis && !ran?.crop) {
      return { ok: false, error: 'no_analysis' };
    }
    return { ok: true, analysis, crop: ran?.crop || analysis?.crop_prediction?.recommended_crop, nodeNumber: plan.nodeNumber };
  }

  if (intent === 'WEATHER_INFO' || intent === 'WEATHER') {
    const farmer = extras.farmer;
    const payload = {};
    let lat = Number(farmer?.profile?.latitude);
    let lon = Number(farmer?.profile?.longitude);
    if ((!Number.isFinite(lat) || !Number.isFinite(lon))) {
      try {
        const pack = extras.nodesPack || await fetchNodes();
        const node = (pack?.nodes || []).find((n) => n.coordinates?.latitude != null);
        if (node) {
          lat = Number(node.coordinates.latitude);
          lon = Number(node.coordinates.longitude);
        }
      } catch {
        /* optional */
      }
    }
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      payload.latitude = lat;
      payload.longitude = lon;
    }
    if (farmer?.profile?.state) payload.state = farmer.profile.state;
    if (payload.latitude == null) {
      const rain = readLatestAnalysis()?.rainfall_intelligence;
      if (rain) return { ok: true, weather: rain, fromAnalysis: true };
      return { ok: false, error: 'weather_unavailable' };
    }
    try {
      const weather = await requestRainfallIntelligence(payload);
      if (!weather || weather.success === false) {
        const rain = readLatestAnalysis()?.rainfall_intelligence;
        if (rain) return { ok: true, weather: rain, fromAnalysis: true };
        return { ok: false, error: 'weather_unavailable' };
      }
      return { ok: true, weather };
    } catch {
      const rain = readLatestAnalysis()?.rainfall_intelligence;
      if (rain) return { ok: true, weather: rain, fromAnalysis: true };
      return { ok: false, error: 'weather_unavailable' };
    }
  }

  if (intent === 'IRRIGATION_INFO') {
    try {
      const res = await fetch(`${API_URL}/api/weather/forecast`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        return { ok: false, error: 'irrigation_unavailable' };
      }
      return { ok: true, irrigation: data, source: 'express_forecast' };
    } catch {
      return { ok: false, error: 'irrigation_unavailable' };
    }
  }

  if (intent === 'FARM_STATUS' || intent === 'NODE_ANOMALY_QUERY') {
    try {
      const [pack, events] = await Promise.all([
        extras.nodesPack ? Promise.resolve(extras.nodesPack) : fetchNodes(),
        fetchAnomalies({ limit: 8 }),
      ]);
      return { ok: true, pack, anomalies: events.rows || [] };
    } catch {
      return { ok: false, error: 'farm_unavailable' };
    }
  }

  if (intent === 'PEST_INFO' || intent === 'FERTILIZER_INFO' || intent === 'CALENDAR_INFO'
    || intent === 'WATER_INFO' || intent === 'SUSTAIN_INFO' || intent === 'SCHEMES_INFO'
    || intent === 'EXPORT_INFO') {
    return { ok: true, page: intent, analysis: readLatestAnalysis() };
  }

  return { ok: true };
}

export { SOIL_KEYS, NUTRIENT_KEYS };
