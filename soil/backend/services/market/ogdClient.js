const axios = require('axios');

const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const HISTORICAL_RESOURCE_ID = '35985678-0d79-46b4-9ed6-6f13308a1d24';
const OGD_URL = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const HISTORICAL_URL = `https://api.data.gov.in/resource/${HISTORICAL_RESOURCE_ID}`;
const PAGE_SIZE = 1000;
let keyLogged = false;
const MAX_PAGES = 3;
const HISTORY_PAGE_SIZE = 1000;
const HISTORY_MAX_PAGES = 8;

function apiKey() {
  return String(process.env.DATA_GOV_API_KEY || '').trim();
}

function fail(status, code, publicMessage, detail) {
  const err = new Error(detail || publicMessage);
  err.appStatus = status;
  err.code = code;
  err.publicMessage = publicMessage;
  return err;
}

function buildParams(filters = {}, offset = 0, limit = PAGE_SIZE) {
  const params = {
    'api-key': apiKey(),
    format: 'json',
    offset,
    limit,
  };
  if (filters.commodity) params['filters[commodity]'] = filters.commodity;
  if (filters.variety) params['filters[variety]'] = filters.variety;
  if (filters.state) params['filters[state]'] = filters.state;
  if (filters.district) params['filters[district]'] = filters.district;
  if (filters.market) params['filters[market]'] = filters.market;
  return params;
}

async function requestPage(filters, offset, limit) {
  const key = apiKey();
  if (!key) {
    throw fail(
      503,
      'MARKET_NOT_CONFIGURED',
      'Market data currently unavailable',
      'DATA_GOV_API_KEY is not set',
    );
  }

  let response;
  try {
    response = await axios.get(OGD_URL, {
      params: buildParams(filters, offset, limit),
      timeout: 25000,
      validateStatus: () => true,
    });
  } catch (err) {
    throw fail(
      502,
      'MARKET_UNAVAILABLE',
      'Market data currently unavailable',
      err.code || 'network error',
    );
  }

  if (response.status === 429) {
    throw fail(429, 'MARKET_RATE_LIMIT', 'Market data currently unavailable', 'OGD rate limit exceeded');
  }
  if (response.status === 401 || response.status === 403) {
    throw fail(502, 'MARKET_AUTH', 'Market data currently unavailable', `OGD HTTP ${response.status}`);
  }
  if (response.status >= 400 || !response.data || typeof response.data !== 'object') {
    throw fail(502, 'MARKET_UNAVAILABLE', 'Market data currently unavailable', `OGD HTTP ${response.status}`);
  }

  const data = response.data;
  const records = Array.isArray(data.records) ? data.records : [];
  if ((data.status && data.status !== 'ok' && !records.length) || (data.message && !Array.isArray(data.records))) {
    throw fail(502, 'MARKET_UNAVAILABLE', 'Market data currently unavailable', String(data.message || data.status || 'OGD error'));
  }

  if (offset === 0 && !keyLogged) {
    keyLogged = true;
    console.log('DATA_GOV_API_KEY loaded: true');
  }

  return {
    title: data.title || 'Current Daily Price of Various Commodities from Various Markets (Mandi)',
    total: Number(data.total) || 0,
    records,
    updated: data.updated || data.created || null,
  };
}

async function fetchRaw(filters = {}, { pages = MAX_PAGES } = {}) {
  const first = await requestPage(filters, 0, PAGE_SIZE);
  const rows = [...first.records];
  const total = first.total || rows.length;
  let offset = rows.length;
  let page = 1;
  while (page < pages && offset < total && first.records.length === PAGE_SIZE) {
    const next = await requestPage(filters, offset, PAGE_SIZE);
    if (!next.records.length) break;
    rows.push(...next.records);
    offset += next.records.length;
    page += 1;
    if (next.records.length < PAGE_SIZE) break;
  }
  return {
    title: first.title,
    updated: first.updated,
    total,
    records: rows,
  };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDmy(iso) {
  const [year, month, day] = String(iso).split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

function isoDateList(startIso, endIso, maxDays = 31) {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < maxDays) {
    dates.push(`${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}-${pad2(cursor.getUTCDate())}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function historicalParams(filters, offset, limit) {
  const params = {
    'api-key': apiKey(),
    format: 'json',
    offset,
    limit,
  };
  if (filters.commodity) params['filters[Commodity]'] = filters.commodity;
  if (filters.variety) params['filters[Variety]'] = filters.variety;
  if (filters.state) params['filters[State]'] = filters.state;
  if (filters.district) params['filters[District]'] = filters.district;
  if (filters.market) params['filters[Market]'] = filters.market;
  if (filters.arrivalDate) params['filters[Arrival_Date]'] = filters.arrivalDate;
  return params;
}

async function requestHistoricalPage(filters, offset, limit) {
  const key = apiKey();
  if (!key) {
    throw fail(
      503,
      'MARKET_NOT_CONFIGURED',
      'Market data currently unavailable',
      'DATA_GOV_API_KEY is not set',
    );
  }

  let response;
  try {
    response = await axios.get(HISTORICAL_URL, {
      params: historicalParams(filters, offset, limit),
      timeout: 35000,
      validateStatus: () => true,
    });
  } catch (err) {
    throw fail(502, 'MARKET_UNAVAILABLE', 'Market data currently unavailable', err.code || 'network error');
  }

  if (response.status === 429) {
    throw fail(429, 'MARKET_RATE_LIMIT', 'Market data currently unavailable', 'OGD rate limit exceeded');
  }
  if (response.status === 401 || response.status === 403) {
    throw fail(502, 'MARKET_AUTH', 'Market data currently unavailable', `OGD HTTP ${response.status}`);
  }
  if (response.status >= 400 || !response.data || typeof response.data !== 'object') {
    throw fail(502, 'MARKET_UNAVAILABLE', 'Market data currently unavailable', `OGD HTTP ${response.status}`);
  }

  const data = response.data;
  const records = Array.isArray(data.records) ? data.records : [];
  return {
    total: Number(data.total) || 0,
    records,
  };
}

async function fetchHistoryDay(filters = {}) {
  const arrivalDate = filters.arrivalDate || toDmy(filters.date);
  if (!arrivalDate) {
    return { records: [], total: 0, arrivalDate: null };
  }

  const query = {
    commodity: filters.commodity,
    variety: filters.variety,
    state: filters.state,
    district: filters.district,
    market: filters.market,
    arrivalDate,
  };

  const maxPages = filters.commodity ? 3 : HISTORY_MAX_PAGES;
  const first = await requestHistoricalPage(query, 0, HISTORY_PAGE_SIZE);
  const rows = [...first.records];
  let offset = rows.length;
  let page = 1;
  while (page < maxPages && offset < first.total && first.records.length === HISTORY_PAGE_SIZE) {
    const next = await requestHistoricalPage(query, offset, HISTORY_PAGE_SIZE);
    if (!next.records.length) break;
    rows.push(...next.records);
    offset += next.records.length;
    page += 1;
    if (next.records.length < HISTORY_PAGE_SIZE) break;
  }

  return {
    arrivalDate,
    total: first.total,
    records: rows,
  };
}

module.exports = {
  RESOURCE_ID,
  HISTORICAL_RESOURCE_ID,
  OGD_URL,
  apiKey,
  fetchRaw,
  fetchHistoryDay,
  isoDateList,
  toDmy,
};
