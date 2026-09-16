import { extras } from '../i18n-dynamic';
import { formatInr } from '../market';
import { formatActionReply, formatDataReply } from './reply';
import { NUTRIENT_KEYS, SOIL_KEYS } from './data';

function tx(t, key, ...args) {
  const value = t?.[key] ?? extras.en[key];
  if (typeof value === 'function') return value(...args);
  if (value != null && value !== '') return value;
  const fallback = extras.en[key];
  if (typeof fallback === 'function') return fallback(...args);
  return fallback || '';
}

function nodeLabel(num) {
  return String(num ?? '').padStart(2, '0');
}

function healthLabel(t, status) {
  if (!status) return '';
  const map = {
    GOOD: t?.health_good,
    AVERAGE: t?.health_average,
    BAD: t?.health_bad,
    CRITICAL: t?.health_critical,
    INFORMATIONAL: t?.health_average,
  };
  return map[status] || status;
}

function fmtValue(item) {
  if (!item || item.value == null || item.value === '') return null;
  const unit = item.unit ? ` ${item.unit}` : '';
  return `${item.value}${unit}`;
}

function sensorRows(sensors, keys, t) {
  return keys.map((key) => {
    const item = sensors?.[key];
    if (!item || item.value == null || item.value === '') return null;
    return {
      label: item.label || key,
      value: fmtValue(item),
      status: healthLabel(t, item.status),
      rank: item.status === 'CRITICAL' ? 3 : item.status === 'BAD' ? 2 : item.status === 'AVERAGE' ? 1 : 0,
    };
  }).filter(Boolean);
}

function linesFromBlocks(blocks) {
  if (!blocks) return '';
  const out = [blocks.title].filter(Boolean);
  if (blocks.overall) out.push(blocks.overall);
  (blocks.sections || []).forEach((sec) => {
    if (sec.heading) out.push(sec.heading);
    (sec.rows || []).forEach((row) => {
      out.push(`${row.label}: ${row.value}${row.status ? ` — ${row.status}` : ''}`);
    });
    if (sec.body) out.push(sec.body);
  });
  if (blocks.conclusion) out.push(blocks.conclusion);
  if (blocks.note) out.push(blocks.note);
  return out.join('\n');
}

function pack(blocks) {
  return { text: linesFromBlocks(blocks), blocks };
}

export function formatInfoReply(plan, data, results, t = extras.en) {
  const intent = plan?.intent;

  if (intent === 'NODE_INFO') {
    if (!data?.ok) {
      if (data?.error === 'fetch_failed') {
        return pack({
          title: tx(t, 'saathi_info_node_title', nodeLabel(plan.nodeNumber)),
          conclusion: tx(t, 'saathi_info_node_fetch_fail', nodeLabel(plan.nodeNumber)),
        });
      }
      return pack({
        title: tx(t, 'saathi_info_node_missing', nodeLabel(plan.nodeNumber)),
        conclusion: tx(t, 'saathi_info_node_missing_p'),
      });
    }
    const node = data.node;
    const sensors = node.sensors || {};
    const focus = data.sensorKey ? sensors[data.sensorKey] : null;
    if (data.sensorKey && !focus) {
      return pack({
        title: tx(t, 'saathi_info_node_title', nodeLabel(node.nodeNumber)),
        conclusion: tx(t, 'saathi_info_sensor_missing', data.sensorKey),
      });
    }
    const alerts = Object.values(sensors).filter((s) => s && (s.status === 'CRITICAL' || s.status === 'BAD'));
    const soil = sensorRows(sensors, SOIL_KEYS, t);
    const nutrients = sensorRows(sensors, NUTRIENT_KEYS, t);
    const sections = [];
    if (focus) {
      sections.push({
        heading: tx(t, 'saathi_sec_focus'),
        rows: [{ label: focus.label || data.sensorKey, value: fmtValue(focus), status: healthLabel(t, focus.status) }].filter((r) => r.value),
      });
    } else {
      if (soil.length) sections.push({ heading: tx(t, 'saathi_sec_soil'), rows: soil });
      if (nutrients.length) sections.push({ heading: tx(t, 'saathi_sec_nutrients'), rows: nutrients });
    }
    if (alerts.length) {
      sections.push({
        heading: tx(t, 'saathi_sec_alerts'),
        rows: alerts.map((s) => ({ label: s.label, value: fmtValue(s), status: healthLabel(t, s.status) })).filter((r) => r.value),
      });
    }
    const overall = node.health === 'CRITICAL' || node.health === 'BAD'
      ? tx(t, 'saathi_info_node_attention', nodeLabel(node.nodeNumber), healthLabel(t, node.health))
      : tx(t, 'saathi_info_node_ok', nodeLabel(node.nodeNumber), healthLabel(t, node.health));
    return pack({
      title: tx(t, 'saathi_info_node_title', nodeLabel(node.nodeNumber)),
      overall: `${tx(t, 'saathi_sec_overall')}: ${healthLabel(t, node.health) || '—'}`,
      sections,
      conclusion: overall,
      note: tx(t, 'saathi_info_sim_note'),
    });
  }

  if (intent === 'NODE_HISTORY') {
    if (!data?.ok) {
      return pack({
        title: tx(t, 'saathi_info_hist_missing', nodeLabel(plan.nodeNumber)),
        conclusion: tx(t, 'saathi_info_hist_missing_p'),
      });
    }
    const rangeLabel = plan.range === '1w' ? tx(t, 'saathi_week') : (plan.range || '');
    const rows = [];
    let largest = null;
    ['soil_moisture', 'temperature', 'nitrogen'].forEach((key) => {
      const stats = data.trends?.[key];
      if (!stats) return;
      rows.push({
        label: key.replace('_', ' '),
        value: `${stats.min} – ${stats.max}`,
        status: '',
      });
      if (!largest || Math.abs(stats.delta) > Math.abs(largest.delta)) largest = { key, ...stats };
    });
    if (!rows.length) {
      return pack({
        title: tx(t, 'saathi_info_hist_title', nodeLabel(data.node.nodeNumber), rangeLabel),
        conclusion: tx(t, 'saathi_info_hist_empty'),
      });
    }
    const crit = (data.anomalies || []).filter((row) => String(row.severity).toUpperCase() === 'CRITICAL');
    return pack({
      title: tx(t, 'saathi_info_hist_title', nodeLabel(data.node.nodeNumber), rangeLabel),
      sections: [
        { heading: tx(t, 'saathi_sec_trend'), rows },
        crit.length
          ? { heading: tx(t, 'saathi_sec_alerts'), body: tx(t, 'saathi_info_hist_alerts', crit.length) }
          : { heading: tx(t, 'saathi_sec_alerts'), body: tx(t, 'saathi_info_hist_no_crit') },
      ],
      conclusion: largest
        ? tx(t, 'saathi_info_hist_change', largest.key.replace('_', ' '))
        : tx(t, 'saathi_info_hist_ok'),
      note: tx(t, 'saathi_info_sim_note'),
    });
  }

  if (intent === 'GIS_SOIL_INFO' || intent === 'GIS_CROP_INFO') {
    if (!data?.ok) {
      return pack({
        title: tx(t, 'saathi_info_gis_missing', plan.place?.name || plan.district?.name || ''),
        conclusion: tx(t, 'saathi_info_gis_missing_p'),
      });
    }
    const name = data.district?.name
      ? `${data.district.name} (${data.place?.name || data.district.state})`
      : (data.place?.name || '');
    const soil = data.agri?.soil || {};
    const crops = (data.agri?.crops || []).join(', ');
    const sections = [];
    if (intent === 'GIS_CROP_INFO') {
      sections.push({ heading: tx(t, 'saathi_sec_crops'), body: crops || '—' });
    } else {
      const rows = [
        soil.label && { label: tx(t, 'saathi_gis_soil_label'), value: soil.label },
        soil.texture && { label: tx(t, 'saathi_gis_texture'), value: soil.texture },
        soil.phRange && { label: tx(t, 'saathi_gis_ph'), value: soil.phRange },
        soil.fertility && { label: tx(t, 'saathi_gis_fertility'), value: soil.fertility },
      ].filter(Boolean);
      if (rows.length) sections.push({ heading: tx(t, 'saathi_sec_soil'), rows });
      if (soil.note) sections.push({ body: soil.note });
      if (crops) sections.push({ heading: tx(t, 'saathi_sec_crops'), body: crops });
    }
    return pack({
      title: tx(t, 'saathi_info_gis_title', name),
      sections,
      conclusion: tx(t, 'saathi_info_gis_note'),
    });
  }

  if (intent === 'MARKET_INFO' || intent === 'MARKET_QUERY') {
    if (!data?.ok) {
      return pack({
        title: tx(t, 'saathi_info_mkt_title', data?.commodity || plan.crop || ''),
        conclusion: tx(t, 'saathi_mkt_unavail', data?.commodity || plan.crop || '', data?.state || ''),
      });
    }
    const rows = data.payload?.observations || data.payload?.prices || data.payload?.commodities || [];
    const top = data.payload?.latest || rows[0] || null;
    if (!top) {
      return pack({
        title: tx(t, 'saathi_info_mkt_title', data.commodity || ''),
        conclusion: tx(t, 'saathi_mkt_empty', data.commodity, data.state || ''),
      });
    }
    const value = top.modalPrice ?? top.modal_price ?? top.modal ?? top.price ?? data.payload?.currentModal;
    const yesterdayWanted = data.yesterday;
    let yesterdayRow = null;
    if (yesterdayWanted) {
      const histRows = data.history?.observations || data.history?.prices || data.history?.data || [];
      const ymd = new Date();
      ymd.setDate(ymd.getDate() - 1);
      const stamp = ymd.toISOString().slice(0, 10);
      yesterdayRow = histRows.find((row) => String(row.date || row.arrival_date || '').startsWith(stamp)) || null;
    }
    const count = Array.isArray(rows) ? rows.length : data.payload?.availableDays;
    const infoRows = [
      value != null && { label: tx(t, 'saathi_mkt_modal'), value: formatInr(value) },
      (top.market || top.mandi) && { label: tx(t, 'saathi_mkt_mandi'), value: top.market || top.mandi },
      (top.date || data.payload?.lastUpdated) && { label: tx(t, 'saathi_mkt_date'), value: top.date || data.payload.lastUpdated },
      count != null && { label: tx(t, 'saathi_mkt_count'), value: String(count) },
    ].filter(Boolean);
    return pack({
      title: tx(t, 'saathi_info_mkt_title', `${data.commodity}${data.state ? ` — ${data.state}` : ''}`),
      sections: [{ heading: tx(t, 'saathi_sec_market'), rows: infoRows }],
      conclusion: yesterdayWanted && !yesterdayRow
        ? tx(t, 'saathi_info_mkt_no_yesterday')
        : yesterdayRow
          ? tx(t, 'saathi_info_mkt_yesterday', formatInr(yesterdayRow.modalPrice ?? yesterdayRow.modal_price ?? yesterdayRow.price))
          : tx(t, 'saathi_info_mkt_ok'),
    });
  }

  if (intent === 'RUN_ANALYSIS' || intent === 'ANALYSIS_INFO' || intent === 'CROP_RECOMMENDATION') {
    if (!data?.ok) {
      return pack({
        title: tx(t, 'saathi_info_an_title'),
        conclusion: tx(t, 'saathi_crop_none'),
      });
    }
    const pred = data.analysis?.crop_prediction || {};
    const crop = data.crop || pred.recommended_crop;
    const top = (pred.top_crops || []).slice(0, 3)
      .filter((row) => row?.crop && row.probability != null)
      .map((row) => ({
        label: row.crop,
        value: `${Math.round(Number(row.probability) * 1000) / 10}%`,
      }));
    return pack({
      title: tx(t, 'saathi_info_an_title', nodeLabel(plan.nodeNumber || '')),
      overall: crop ? `${tx(t, 'saathi_info_an_crop')}: ${crop}` : '',
      sections: top.length ? [{ heading: tx(t, 'saathi_sec_confidence'), rows: top }] : [],
      conclusion: tx(t, 'saathi_info_an_note'),
    });
  }

  if (intent === 'WEATHER_INFO' || intent === 'WEATHER') {
    if (!data?.ok) {
      return pack({
        title: tx(t, 'saathi_info_wx_title'),
        conclusion: tx(t, 'saathi_wx_none'),
      });
    }
    const w = data.weather || {};
    const cur = w.current_weather || {};
    const rows = [
      cur.temperature_c != null && { label: tx(t, 'analyze_temperature'), value: `${cur.temperature_c} °C` },
      cur.humidity_pct != null && { label: tx(t, 'analyze_humidity'), value: `${cur.humidity_pct} %` },
      w.rainfall_today_mm != null && { label: tx(t, 'pg_rain_today'), value: `${w.rainfall_today_mm} mm` },
      w.rainfall_next_24h_mm != null && { label: tx(t, 'pg_rain_24h'), value: `${w.rainfall_next_24h_mm} mm` },
      w.rainfall_next_3_days_mm != null && { label: tx(t, 'pg_rain_3d'), value: `${w.rainfall_next_3_days_mm} mm` },
      w.rainfall_trend && { label: tx(t, 'pg_rain_trend'), value: w.rainfall_trend },
      w.heavy_rain_risk && { label: tx(t, 'pg_rain_heavy'), value: w.heavy_rain_risk },
      w.dry_spell_risk && { label: tx(t, 'pg_rain_dry'), value: w.dry_spell_risk },
    ].filter(Boolean);
    return pack({
      title: tx(t, 'saathi_info_wx_title'),
      sections: [{ heading: tx(t, 'saathi_sec_weather'), rows }],
      conclusion: tx(t, 'saathi_info_wx_note'),
    });
  }

  if (intent === 'IRRIGATION_INFO') {
    if (!data?.ok) {
      return pack({
        title: tx(t, 'saathi_info_irr_title'),
        conclusion: tx(t, 'saathi_info_irr_none'),
      });
    }
    const rec = data.irrigation?.smart_irrigation_recommendation;
    const rows = [
      rec?.action && { label: tx(t, 'saathi_sec_summary'), value: rec.action },
      rec?.optimal_time && { label: tx(t, 'saathi_irr_window'), value: rec.optimal_time },
      rec?.duration_minutes != null && { label: tx(t, 'saathi_irr_duration'), value: `${rec.duration_minutes} min` },
    ].filter(Boolean);
    return pack({
      title: tx(t, 'saathi_info_irr_title'),
      sections: rows.length ? [{ heading: tx(t, 'saathi_sec_summary'), rows }] : [],
      conclusion: tx(t, 'saathi_info_irr_note'),
    });
  }

  const pageCopy = {
    PEST_INFO: 'saathi_info_pest',
    FERTILIZER_INFO: 'saathi_info_fert',
    CALENDAR_INFO: 'saathi_info_cal',
    WATER_INFO: 'saathi_info_water',
    SUSTAIN_INFO: 'saathi_info_sust',
    SCHEMES_INFO: 'saathi_info_schemes',
    EXPORT_INFO: 'saathi_info_export',
  };
  if (pageCopy[intent]) {
    return pack({
      title: tx(t, `${pageCopy[intent]}_title`),
      conclusion: tx(t, pageCopy[intent]),
    });
  }

  if (plan?.mode === 'data') {
    return { text: formatDataReply(plan, data, t), blocks: null };
  }
  return { text: formatActionReply(plan, results, t), blocks: null };
}
