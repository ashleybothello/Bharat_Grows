import { extras } from '../i18n-dynamic';
import { readLatestAnalysis } from '../latestAnalysis';
import { formatInr } from '../market';
import { agriForPlace, nameForIso } from './places';

function firstOk(results, type) {
  return (results || []).find((row) => row.type === type && row.ok);
}

function anyFail(results, types) {
  return (results || []).find((row) => types.includes(row.type) && row.ok === false);
}

function tx(t, key, ...args) {
  const value = t?.[key] ?? extras.en[key];
  if (typeof value === 'function') return value(...args);
  if (value != null && value !== '') return value;
  const fallback = extras.en[key];
  if (typeof fallback === 'function') return fallback(...args);
  return fallback || '';
}

function nodeLabel(num) {
  return String(num).padStart(2, '0');
}

function healthPhrase(t, health) {
  if (!health) return '';
  const map = {
    GOOD: t?.health_good,
    AVERAGE: t?.health_average,
    BAD: t?.health_bad,
    CRITICAL: t?.health_critical,
  };
  return tx(t, 'saathi_health', map[health] || health);
}

export function formatActionReply(plan, results, t = extras.en) {
  const intent = plan.intent;
  const gisSelect = firstOk(results, 'selectGISState') || firstOk(results, 'searchGISLocation') || firstOk(results, 'zoomToGISRegion');
  const gisFail = anyFail(results, ['selectGISState', 'searchGISLocation', 'zoomToGISRegion']);
  const openFail = anyFail(results, ['openGIS', 'openMap', 'openAnalyze', 'openHistory', 'openMarket']);

  if (openFail?.error === 'timeout') {
    return tx(t, 'saathi_open_timeout');
  }

  if (intent === 'NAVIGATE_GIS' || (intent === 'GIS_SOIL_SEARCH' && !plan.place && !plan.soilGroup)) {
    return tx(t, 'saathi_gis_opened');
  }

  if (intent === 'GIS_SOIL_FILTER') {
    const pack = (results || []).find((row) => row.type === 'gisSoilGroup');
    const names = (pack?.states || []).map((row) => row.name).filter(Boolean);
    const label = plan.soilGroup?.label || 'that soil group';
    if (!names.length) {
      return tx(t, 'saathi_gis_soil_none', label);
    }
    return tx(t, 'saathi_gis_soil_list', label, names.join(', '));
  }

  if (intent === 'GIS_SOIL_SEARCH' || intent === 'GIS_CROP_SEARCH') {
    if (gisFail && !gisSelect) {
      if (gisFail.error === 'timeout') return tx(t, 'saathi_open_timeout');
      return tx(t, 'saathi_gis_missing', plan.place?.name);
    }
    const name = gisSelect?.name || plan.place?.name;
    const agri = gisSelect?.agri || agriForPlace(plan.place);
    if (!name) return tx(t, 'saathi_gis_opened');
    if (!agri) {
      return tx(t, 'saathi_gis_no_agri', name);
    }
    if (intent === 'GIS_CROP_SEARCH') {
      const crops = (agri.crops || []).join(', ') || '—';
      return tx(t, 'saathi_gis_crops', name, crops);
    }
    return tx(t, 'saathi_gis_soil', name, agri.soil.label, agri.soil.texture, agri.soil.phRange, agri.soil.note);
  }

  if (intent === 'NAVIGATE_MAP') {
    return tx(t, 'saathi_map_opened');
  }

  if (intent === 'NODE_SELECT') {
    const node = firstOk(results, 'selectNode') || firstOk(results, 'showNodeDetails');
    if (!node?.ok) {
      return tx(t, 'saathi_node_missing', nodeLabel(plan.nodeNumber));
    }
    return tx(t, 'saathi_node_selected', nodeLabel(plan.nodeNumber), healthPhrase(t, node.health));
  }

  if (intent === 'RUN_ANALYSIS') {
    const ran = firstOk(results, 'runAnalysis');
    if (!ran) {
      const sel = anyFail(results, ['selectAnalysisNode', 'runAnalysis']);
      if (sel?.error === 'missing_node') {
        return tx(t, 'saathi_analyze_missing', nodeLabel(plan.nodeNumber));
      }
      return tx(t, 'saathi_analyze_fail');
    }
    const crop = ran.crop || ran.recommended;
    return crop
      ? tx(t, 'saathi_analyze_crop', nodeLabel(plan.nodeNumber), crop)
      : tx(t, 'saathi_analyze_ok', nodeLabel(plan.nodeNumber));
  }

  if (intent === 'HISTORY') {
    const nodeAct = (results || []).find((row) => row.type === 'selectHistoryNode' || row.type === 'showNodeHistory');
    const rangeLabel = plan.range === '1w' ? tx(t, 'saathi_week') : (plan.range || '');
    if (plan.nodeNumber && nodeAct && !nodeAct.ok) {
      return tx(t, 'saathi_hist_missing', nodeLabel(plan.nodeNumber), rangeLabel);
    }
    return plan.nodeNumber && nodeAct?.ok
      ? tx(t, 'saathi_hist_node', nodeLabel(plan.nodeNumber), rangeLabel)
      : tx(t, 'saathi_hist_ok', rangeLabel);
  }

  if (intent === 'MARKET_QUERY') {
    const price = firstOk(results, 'showMarketPrice') || firstOk(results, 'showMarketTrend');
    if (!price) {
      return tx(t, 'saathi_mkt_filter_fail');
    }
    if (!price.ok) {
      return tx(t, 'saathi_mkt_unavail', price.commodity || plan.crop || '', price.state || '');
    }
    const rows = price.data?.observations || price.data?.prices || price.data?.commodities || [];
    const top = price.data?.latest || rows[0] || null;
    if (!top) {
      return tx(t, 'saathi_mkt_empty', price.commodity, price.state || '');
    }
    const value = top.modalPrice ?? top.modal_price ?? top.price;
    const market = top.market || top.mandi || '';
    return tx(t, 'saathi_mkt_ok', price.commodity, price.state || '', formatInr(value), market, top.date || '');
  }

  if (intent === 'NAVIGATE_ANALYZE') return tx(t, 'saathi_nav_analyze');
  if (intent === 'NAVIGATE_DASHBOARD') return tx(t, 'saathi_nav_dashboard');
  if (intent === 'NAVIGATE_PROFILE') return tx(t, 'saathi_nav_profile');
  if (intent === 'NAVIGATE_BETA') return tx(t, 'saathi_nav_beta');
  if (intent === 'NAVIGATE_SATELLITE') return tx(t, 'saathi_nav_satellite');
  if (intent === 'NAVIGATE_RESULTS') return tx(t, 'saathi_nav_results');
  if (intent === 'NAVIGATE_MARKET') return tx(t, 'saathi_nav_market');
  if (intent === 'NAVIGATE_HISTORY') return tx(t, 'saathi_nav_history');
  if (intent === 'NAVIGATE_WEATHER') return tx(t, 'saathi_nav_weather');
  if (intent === 'NAVIGATE_IRRIGATION') return tx(t, 'saathi_nav_irrigation');

  const gisName = gisSelect?.name || plan.place?.name;
  if (gisName) return tx(t, 'saathi_gis_focus', gisName);
  return tx(t, 'saathi_done');
}

export function formatDataReply(plan, { nodesPack, anomalies, lastAnalysis, farmer } = {}, t = extras.en) {
  const nodes = nodesPack?.nodes || [];
  const tally = nodesPack?.tally || {};
  const analysis = lastAnalysis || readLatestAnalysis();

  if (plan.intent === 'FARM_STATUS') {
    if (!nodes.length) {
      return tx(t, 'saathi_farm_empty');
    }
    const critical = nodes.filter((n) => n.health === 'CRITICAL');
    const nLabel = farmer?.profile?.farmName || farmer?.name || '';
    const extra = critical.length
      ? `${tx(t, 'health_critical')}: ${critical.map((n) => nodeLabel(n.nodeNumber)).join(', ')}.`
      : tx(t, 'saathi_no_critical');
    return tx(
      t,
      'saathi_farm_status',
      nLabel,
      nodes.length,
      tally.GOOD || 0,
      (tally.AVERAGE || 0) + (tally.BAD || 0),
      tally.CRITICAL || 0,
      extra,
    );
  }

  if (plan.intent === 'CROP_RECOMMENDATION') {
    const crop = analysis?.crop_prediction?.recommended_crop
      || analysis?.recommended_crops?.[0];
    if (!crop) {
      return tx(t, 'saathi_crop_none');
    }
    return tx(t, 'saathi_crop_ok', crop);
  }

  if (plan.intent === 'WEATHER') {
    const rain = analysis?.rainfall_intelligence;
    if (!rain) {
      return tx(t, 'saathi_wx_none');
    }
    return tx(t, 'saathi_wx_ok', rain.rainfall_today_mm, rain.rainfall_next_24h_mm, rain.rainfall_next_3_days_mm);
  }

  if (plan.intent === 'NODE_ANOMALY_QUERY') {
    const rows = (anomalies || []).filter((row) => row.severity === 'CRITICAL' || row.health === 'CRITICAL');
    const hot = nodes.filter((n) => n.health === 'CRITICAL');
    if (!rows.length && !hot.length) return tx(t, 'saathi_alert_none');
    const bits = hot.length
      ? hot.map((n) => `${nodeLabel(n.nodeNumber)} (${t?.health_critical || n.health})`).join('; ')
      : rows.slice(0, 4).map((row) => `${row.nodeNumber} ${row.sensor} ${row.value}`).join('; ');
    return tx(t, 'saathi_alert_ok', bits);
  }

  return tx(t, 'saathi_help');
}

export function serializeAgri(iso, agri) {
  if (!agri) return null;
  return {
    iso,
    name: nameForIso(iso),
    region: agri.region,
    soil: {
      id: agri.soil.id,
      label: agri.soil.label,
      texture: agri.soil.texture,
      fertility: agri.soil.fertility,
      phRange: agri.soil.phRange,
      organicCarbon: agri.soil.organicCarbon,
      note: agri.soil.note,
    },
    crops: agri.crops,
  };
}
