const ogdClient = require('./ogdClient');
const store = require('./marketStore');
const sync = require('./marketSync');
const { SOURCE } = require('./normalize');

const POPULAR_HINTS = [
  'wheat', 'paddy', 'rice', 'soyabean', 'soybean', 'cotton', 'onion', 'potato',
  'tomato', 'maize', 'gram', 'mustard', 'groundnut', 'bajra', 'jowar', 'turmeric',
];

function cleanFilters(query = {}) {
  const trim = (v) => (v == null ? '' : String(v).trim());
  return {
    commodity: trim(query.commodity),
    variety: trim(query.variety),
    state: trim(query.state),
    district: trim(query.district),
    market: trim(query.market),
    date: trim(query.date),
  };
}

function percentChange(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function average(values) {
  if (!values.length) return null;
  return Number((values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(2));
}

function daySpan(start, end) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function seriesFrom(records) {
  const byDate = new Map();
  for (const row of records) {
    const bucket = byDate.get(row.date) || [];
    bucket.push(row);
    byDate.set(row.date, bucket);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, prices]) => ({
      date,
      min: average(prices.map((row) => row.minPrice).filter((n) => n != null)),
      modal: average(prices.map((row) => row.modalPrice).filter((n) => n != null)),
      max: average(prices.map((row) => row.maxPrice).filter((n) => n != null)),
      mandis: new Set(prices.map((row) => row.market)).size,
    }))
    .filter((point) => point.modal != null);
}

function shiftMonths(isoDate, months) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function windowStart(endIso, range) {
  const raw = String(range || '7d').trim().toLowerCase();
  if (raw === '1d') return endIso;
  if (raw === '7d') return sync.daysAgo(endIso, 6);
  if (raw === '1m' || raw === '30d') return shiftMonths(endIso, -1);
  if (raw === '3m' || raw === '90d') return shiftMonths(endIso, -3);
  if (raw === '6m' || raw === '180d') return shiftMonths(endIso, -6);
  if (raw === '1y' || raw === '365d') return shiftMonths(endIso, -12);
  return sync.daysAgo(endIso, 6);
}

function liveFetchDays(range) {
  const raw = String(range || '7d').trim().toLowerCase();
  if (raw === '1d') return 2;
  if (raw === '7d') return 7;
  return sync.LIVE_HISTORY_DAYS;
}

function clipSeries(series, range) {
  if (!series.length) return [];
  const end = series[series.length - 1].date;
  const start = windowStart(end, range);
  return series.filter((point) => point.date >= start && point.date <= end);
}

function windowAverage(series, currentDate, days, minPoints) {
  const start = sync.daysAgo(currentDate, days);
  const slice = series.filter((point) => point.date >= start && point.date <= currentDate);
  if (slice.length < minPoints) return null;
  return average(slice.map((point) => point.modal));
}

function signalFrom(current, avg30) {
  if (current == null || avg30 == null) return null;
  const percent = percentChange(current, avg30);
  if (percent >= 10) {
    return {
      code: 'ABOVE_USUAL',
      label: 'Above usual',
      detail: `Modal price is ${Math.abs(percent)}% above the selected historical average.`,
      percent,
    };
  }
  if (percent <= -10) {
    return {
      code: 'BELOW_USUAL',
      label: 'Below usual',
      detail: `Modal price is ${Math.abs(percent)}% below the selected historical average.`,
      percent,
    };
  }
  return {
    code: 'NORMAL',
    label: 'Within recent range',
    detail: `Modal price is ${percent}% from the selected historical average.`,
    percent,
  };
}

function rangeAvailability(series) {
  const count = series.length;
  const first = series[0]?.date;
  const last = series[series.length - 1]?.date;
  const span = daySpan(first, last);
  const collecting = 'Historical data is still being collected for this period.';
  return {
    '1d': { enabled: count >= 1, reason: count >= 1 ? null : collecting },
    '7d': { enabled: count >= 2, reason: count >= 2 ? null : collecting },
    '1m': { enabled: count >= 4, reason: count >= 4 ? null : collecting },
    '3m': { enabled: span >= 60 && count >= 12, reason: span >= 60 && count >= 12 ? null : collecting },
    '6m': { enabled: span >= 150 && count >= 20, reason: span >= 150 && count >= 20 ? null : collecting },
    '1y': { enabled: span >= 270 && count >= 30, reason: span >= 270 && count >= 30 ? null : collecting },
  };
}

function metricsFrom(series, mandiCount) {
  if (!series.length) return null;
  const latest = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : null;
  const modals = series.map((point) => point.modal);
  const change = previous ? Number((latest.modal - previous.modal).toFixed(2)) : null;
  return {
    latest: latest.modal,
    previous: previous ? previous.modal : null,
    previousDate: previous ? previous.date : null,
    change,
    changePercent: previous && previous.modal > 0 ? percentChange(latest.modal, previous.modal) : null,
    average: average(modals),
    high: Math.max(...modals),
    low: Math.min(...modals),
    mandiCount,
    observationDays: series.length,
  };
}

function recordsForScope(records, filters) {
  return records.filter((row) => {
    const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
    if (filters.variety && !eq(row.variety, filters.variety)) return false;
    if (filters.market && !eq(row.market, filters.market)) return false;
    if (filters.district && !eq(row.district, filters.district)) return false;
    if (filters.state && !eq(row.state, filters.state)) return false;
    return true;
  });
}

function scopeLabel(filters) {
  if (filters.market) return `mandi: ${filters.market}`;
  if (filters.district) return `district: ${filters.district}`;
  if (filters.state) return `state: ${filters.state}`;
  return 'all available mandis';
}

function seriesLabel(filters) {
  if (filters.market) return `Modal price at ${filters.market}`;
  if (filters.district) return 'Average modal price across available mandis';
  if (filters.state) return 'Average modal price across available mandis';
  return 'Average modal price across available mandis';
}

function latestByCommodity(records) {
  const map = new Map();
  for (const row of records) {
    const current = map.get(row.commodity);
    if (!current || row.date > current.date) map.set(row.commodity, row);
  }
  return [...map.values()];
}

const FEATURED = ['wheat', 'paddy', 'rice', 'soyabean', 'soybean', 'cotton', 'onion', 'potato', 'tomato', 'maize', 'mustard', 'groundnut'];

function featuredRank(name) {
  const n = String(name || '').toLowerCase();
  const exact = FEATURED.findIndex((item) => n === item);
  if (exact >= 0) return exact;
  if (n.includes('paddy')) return 1;
  if (n.includes('soyabean') || n.includes('soybean')) return 4;
  const starts = FEATURED.findIndex((item) => n.startsWith(`${item} `) || n.startsWith(`${item}(`));
  if (starts >= 0) return starts + 0.4;
  return 80;
}

function isPopular(name) {
  const lower = String(name || '').toLowerCase();
  return featuredRank(name) < 80 || POPULAR_HINTS.some((hint) => lower.includes(hint));
}

async function load(filters, { historyDays = 0 } = {}) {
  await sync.ensureSnapshot(filters);
  let records = await store.query(sync.compactFilters(filters));
  if (!records.length && (filters.district || filters.market)) {
    const broader = { ...filters, district: '', market: '' };
    await sync.ensureSnapshot(broader);
    records = await store.query(sync.compactFilters(filters));
  }
  if (historyDays) {
    await sync.ensureHistory(filters, historyDays);
    records = await store.query(sync.compactFilters(filters));
  }
  return records;
}

async function getPrices(query) {
  const filters = cleanFilters(query);
  const records = await load(filters);
  const limit = Math.min(Number(query.limit) || 250, 1000);
  return {
    source: SOURCE,
    persistence: store.persistence(),
    lastUpdated: records[0]?.date || null,
    count: records.length,
    records: records.slice(0, limit),
  };
}

function packSeries(records, latest, filters, range) {
  const focused = recordsForScope(records, filters);
  const full = seriesFrom(focused);
  const observations = clipSeries(full, range);
  const avg30 = full.length ? windowAverage(full, full[full.length - 1].date, 30, 8) : null;
  const current = full[full.length - 1] || null;
  const previous = full.length > 1 ? full[full.length - 2] : null;
  const latestDate = latest?.date || current?.date;
  const mandiCount = new Set(focused.filter((row) => row.date === latestDate).map((row) => row.market)).size;
  const windowMetrics = metricsFrom(observations.length ? observations : full, mandiCount);
  const lifeMetrics = metricsFrom(full, mandiCount);
  const points = observations.map((point) => ({
    date: point.date,
    min: point.min,
    modal: point.modal,
    max: point.max,
  }));
  return {
    observations: points,
    data: points,
    chart: points,
    ranges: rangeAvailability(full),
    metrics: {
      latest: lifeMetrics?.latest ?? null,
      previous: lifeMetrics?.previous ?? null,
      previousDate: lifeMetrics?.previousDate ?? null,
      change: lifeMetrics?.change ?? null,
      changePercent: lifeMetrics?.changePercent ?? null,
      average: windowMetrics?.average ?? null,
      high: windowMetrics?.high ?? null,
      low: windowMetrics?.low ?? null,
      mandiCount,
      observationDays: observations.length,
    },
    signal: current ? signalFrom(current.modal, avg30) : null,
    seriesLabel: seriesLabel(filters),
    scope: scopeLabel(filters),
    observationCount: full.length,
    availableDays: observations.length,
    latestDate: current?.date || latest?.date || null,
    average30d: avg30,
    currentModal: current?.modal ?? latest?.modalPrice ?? null,
    previousModal: previous?.modal ?? null,
    changePercent: previous && previous.modal > 0 ? percentChange(current.modal, previous.modal) : null,
  };
}

async function getCommodity(commodity, query) {
  const filters = cleanFilters({ ...query, commodity });
  const historyDays = query.range ? liveFetchDays(query.range) : 0;
  const records = await load(filters, { historyDays });
  const latest = records[0] || null;
  const packed = packSeries(records, latest, filters, query.range);
  const markets = await getMarkets({ ...query, commodity });
  return {
    source: SOURCE,
    persistence: store.persistence(),
    lastUpdated: latest?.date || null,
    commodity,
    latest,
    range: String(query.range || '7d').toLowerCase(),
    ...packed,
    markets: markets.markets,
    unit: '₹/quintal',
  };
}

async function getHistory(commodity, query) {
  const data = await getCommodity(commodity, query);
  return {
    source: data.source,
    persistence: data.persistence,
    commodity: data.commodity,
    range: data.range,
    lastUpdated: data.lastUpdated,
    seriesLabel: data.seriesLabel,
    ranges: data.ranges,
    observations: data.observations,
    chart: data.chart,
    metrics: data.metrics,
  };
}

async function getTrends(query) {
  const filters = cleanFilters(query);
  if (!filters.commodity) {
    const err = new Error('commodity is required');
    err.appStatus = 400;
    err.code = 'BAD_REQUEST';
    err.publicMessage = 'Choose a crop to view its price trend.';
    throw err;
  }
  const data = await getCommodity(filters.commodity, query);
  return {
    source: data.source,
    persistence: data.persistence,
    lastUpdated: data.lastUpdated,
    commodity: data.commodity,
    market: filters.market || null,
    range: data.range,
    scope: data.scope,
    seriesLabel: data.seriesLabel,
    observationCount: data.observationCount,
    availableDays: data.availableDays,
    latestDate: data.latestDate,
    ranges: data.ranges,
    data: data.data,
    series: data.data,
    observations: data.observations,
    chart: data.chart,
    metrics: data.metrics,
    intelligence: {
      currentDate: data.lastUpdated,
      currentModal: data.currentModal,
      previousModal: data.previousModal,
      change1d: data.changePercent,
      series: data.observations.map((point) => ({
        date: point.date,
        minPrice: point.min,
        modalPrice: point.modal,
        maxPrice: point.max,
      })),
      signal: data.signal,
      observationCount: data.observationCount,
    },
  };
}

async function getMarkets(query) {
  const filters = cleanFilters(query);
  const records = await load(filters);
  const latestDate = records[0]?.date;
  const onDate = latestDate ? records.filter((row) => row.date === latestDate) : [];
  const byMarket = new Map();
  for (const row of onDate) {
    const key = `${row.market}|${row.variety}|${row.grade || ''}`;
    if (!byMarket.has(key)) byMarket.set(key, { ...row });
  }
  const sort = String(query.sort || 'highest').toLowerCase();
  const markets = [...byMarket.values()].sort((a, b) => {
    if (sort === 'market' || sort === 'name') return a.market.localeCompare(b.market);
    if (sort === 'lowest' || sort === 'low') return (a.modalPrice || 0) - (b.modalPrice || 0);
    return (b.modalPrice || 0) - (a.modalPrice || 0);
  });
  const prices = markets.map((row) => row.modalPrice).filter((n) => n != null);
  const highest = prices.length ? Math.max(...prices) : null;
  const lowest = prices.length ? Math.min(...prices) : null;
  return {
    source: SOURCE,
    persistence: store.persistence(),
    lastUpdated: latestDate || null,
    commodity: filters.commodity || null,
    count: markets.length,
    highestModal: highest,
    lowestModal: lowest,
    markets: markets.map((row) => ({
      ...row,
      highlight: row.modalPrice === highest && row.modalPrice === lowest
        ? null
        : row.modalPrice === highest
          ? 'highest'
          : row.modalPrice === lowest
            ? 'lowest'
            : null,
    })),
  };
}

async function getSummary(query) {
  const filters = cleanFilters(query);
  const search = String(query.q || query.search || '').trim().toLowerCase();
  const pin = String(query.pin || '').trim().toLowerCase();
  const records = await load({ ...filters, commodity: '' });
  const latest = latestByCommodity(records);
  const ranked = latest
    .filter((row) => !search || row.commodity.toLowerCase().includes(search))
    .sort((a, b) => {
      const aPin = pin && a.commodity.toLowerCase() === pin ? 0 : 1;
      const bPin = pin && b.commodity.toLowerCase() === pin ? 0 : 1;
      if (aPin !== bPin) return aPin - bPin;
      const aFeat = featuredRank(a.commodity);
      const bFeat = featuredRank(b.commodity);
      if (aFeat !== bFeat) return aFeat - bFeat;
      const aPop = isPopular(a.commodity) ? 0 : 1;
      const bPop = isPopular(b.commodity) ? 0 : 1;
      if (aPop !== bPop) return aPop - bPop;
      return a.commodity.localeCompare(b.commodity);
    });

  const cards = ranked.slice(0, 16).map((row) => {
    const cropRows = records.filter((item) => item.commodity === row.commodity);
    const packed = packSeries(cropRows, row, { ...filters, commodity: row.commodity }, '7d');
    return {
      commodity: row.commodity,
      market: row.market,
      state: row.state,
      district: row.district,
      variety: row.variety,
      date: row.date,
      modalPrice: row.modalPrice,
      minPrice: row.minPrice,
      maxPrice: row.maxPrice,
      unit: row.unit,
      change: packed.metrics?.change ?? null,
      changePercent: packed.metrics?.changePercent ?? null,
      change1d: packed.metrics?.changePercent ?? null,
      observationDays: packed.observationCount,
      popular: isPopular(row.commodity),
    };
  });

  return {
    source: SOURCE,
    persistence: store.persistence(),
    lastUpdated: records[0]?.date || null,
    count: cards.length,
    commodities: cards,
    unit: '₹/quintal',
  };
}

async function getStatus() {
  const coverage = await store.coverage();
  return {
    source: SOURCE,
    ...coverage,
    liveHistoryDays: sync.LIVE_HISTORY_DAYS,
    backfillDays: sync.BACKFILL_DAYS,
  };
}

module.exports = {
  SOURCE,
  RESOURCE_ID: ogdClient.RESOURCE_ID,
  HISTORICAL_RESOURCE_ID: ogdClient.HISTORICAL_RESOURCE_ID,
  getPrices,
  getCommodity,
  getHistory,
  getTrends,
  getMarkets,
  getSummary,
  getStatus,
  backfill: sync.backfill,
  syncDaily: sync.syncDaily,
  ensureSnapshot: sync.ensureSnapshot,
};
