const { pool } = require('../../db');
const { recordKey, matchesFilters } = require('./normalize');

const TTL_MS = Number(process.env.MARKET_CACHE_TTL_MS || 20 * 60 * 1000);
const memory = new Map();
const fetchTimes = new Map();
const fetchLocks = new Map();

function useDb() {
  return Boolean(String(process.env.DATABASE_URL || '').trim());
}

function persistence() {
  return useDb() ? 'postgres' : 'memory';
}

function isFresh(cacheKey) {
  const ts = fetchTimes.get(cacheKey);
  return Boolean(ts && Date.now() - ts < TTL_MS);
}

function rememberFetch(cacheKey) {
  fetchTimes.set(cacheKey, Date.now());
}

function samePrices(a, b) {
  if (!a || !b) return false;
  return a.minPrice === b.minPrice && a.maxPrice === b.maxPrice && a.modalPrice === b.modalPrice;
}

function ingestMemory(records) {
  const stats = { inserted: 0, updated: 0, skipped: 0 };
  for (const row of records) {
    const key = recordKey(row);
    const previous = memory.get(key);
    if (previous && samePrices(previous, row)) {
      stats.skipped += 1;
      continue;
    }
    memory.set(key, row);
    if (previous) stats.updated += 1;
    else stats.inserted += 1;
  }
  return stats;
}

async function ingestDb(records) {
  if (!useDb() || !records.length) {
    return { inserted: 0, updated: 0, skipped: 0, persisted: 0 };
  }
  const stats = { inserted: 0, updated: 0, skipped: 0, persisted: 0 };
  for (const row of records) {
    try {
      const result = await pool.query(
        `INSERT INTO market_prices
          (commodity, variety, grade, market, state, district, arrival_date, min_price, max_price, modal_price, source, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())
         ON CONFLICT (commodity, variety, market, state, district, arrival_date)
         DO UPDATE SET
           grade = EXCLUDED.grade,
           min_price = EXCLUDED.min_price,
           max_price = EXCLUDED.max_price,
           modal_price = EXCLUDED.modal_price,
           source = EXCLUDED.source,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserted,
                   min_price AS "minPrice",
                   max_price AS "maxPrice",
                   modal_price AS "modalPrice"`,
        [
          row.commodity,
          row.variety,
          row.grade || '',
          row.market,
          row.state,
          row.district || '',
          row.date,
          row.minPrice,
          row.maxPrice,
          row.modalPrice,
          row.source,
        ],
      );
      stats.persisted += 1;
      if (result.rows[0]?.inserted) stats.inserted += 1;
      else stats.skipped += 1;
    } catch (err) {
      console.error('[MARKET STORE]', err.message);
    }
  }
  return stats;
}

async function ingest(cacheKey, records) {
  const memoryStats = ingestMemory(records);
  rememberFetch(cacheKey);
  const dbStats = await ingestDb(records);
  return {
    fetched: records.length,
    inserted: useDb() ? dbStats.inserted : memoryStats.inserted,
    updated: useDb() ? dbStats.updated : memoryStats.updated,
    skipped: useDb() ? dbStats.skipped : memoryStats.skipped,
    persistence: persistence(),
  };
}

function queryMemory(filters = {}) {
  const rows = [];
  for (const row of memory.values()) {
    if (matchesFilters(row, filters)) rows.push(row);
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.market.localeCompare(b.market)));
}

async function queryDb(filters = {}) {
  const clauses = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    clauses.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.commodity) add('LOWER(commodity) = LOWER(?)', filters.commodity);
  if (filters.variety) add('LOWER(variety) = LOWER(?)', filters.variety);
  if (filters.state) add('LOWER(state) = LOWER(?)', filters.state);
  if (filters.district) add('LOWER(district) = LOWER(?)', filters.district);
  if (filters.market) add('LOWER(market) = LOWER(?)', filters.market);
  if (filters.date) add('arrival_date = ?', filters.date);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT commodity, variety, grade, market, state, district,
            TO_CHAR(arrival_date, 'YYYY-MM-DD') AS date,
            min_price AS "minPrice",
            max_price AS "maxPrice",
            modal_price AS "modalPrice",
            source
     FROM market_prices
     ${where}
     ORDER BY arrival_date DESC, market ASC
     LIMIT 8000`,
    values,
  );
  return result.rows.map((row) => ({ ...row, unit: '₹/quintal' }));
}

async function query(filters = {}) {
  const mem = queryMemory(filters);
  if (!useDb()) return mem;
  try {
    const rows = await queryDb(filters);
    return rows.length ? rows : mem;
  } catch (err) {
    console.error('[MARKET STORE QUERY]', err.message);
    return mem;
  }
}

async function coverage() {
  if (useDb()) {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*)::int AS observations,
          COUNT(DISTINCT commodity)::int AS commodities,
          COUNT(DISTINCT state)::int AS states,
          COUNT(DISTINCT market)::int AS mandis,
          MIN(arrival_date)::text AS first_date,
          MAX(arrival_date)::text AS last_date
        FROM market_prices
      `);
      return { ...result.rows[0], persistence: 'postgres' };
    } catch (err) {
      console.error('[MARKET STORE COVERAGE]', err.message);
    }
  }
  const rows = [...memory.values()];
  const dates = rows.map((row) => row.date).sort();
  return {
    observations: rows.length,
    commodities: new Set(rows.map((row) => row.commodity)).size,
    states: new Set(rows.map((row) => row.state)).size,
    mandis: new Set(rows.map((row) => row.market)).size,
    first_date: dates[0] || null,
    last_date: dates[dates.length - 1] || null,
    persistence: 'memory',
  };
}

function allMemory() {
  return [...memory.values()];
}

function withLock(cacheKey, fn) {
  if (fetchLocks.has(cacheKey)) return fetchLocks.get(cacheKey);
  const job = Promise.resolve()
    .then(fn)
    .finally(() => fetchLocks.delete(cacheKey));
  fetchLocks.set(cacheKey, job);
  return job;
}

module.exports = {
  TTL_MS,
  useDb,
  persistence,
  isFresh,
  ingest,
  query,
  coverage,
  allMemory,
  withLock,
  cacheKey(filters = {}) {
    return JSON.stringify({
      commodity: filters.commodity || '',
      variety: filters.variety || '',
      state: filters.state || '',
      district: filters.district || '',
      market: filters.market || '',
      historyDate: filters.historyDate || '',
    });
  },
};
