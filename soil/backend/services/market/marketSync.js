const ogdClient = require('./ogdClient');
const store = require('./marketStore');
const { SOURCE, normalizeRecords } = require('./normalize');

const LIVE_HISTORY_DAYS = Math.min(Number(process.env.MARKET_LIVE_HISTORY_DAYS || 14), 31);
const BACKFILL_DAYS = Math.min(Number(process.env.MARKET_BACKFILL_DAYS || 30), 90);
const REQUEST_GAP_MS = Number(process.env.MARKET_SYNC_GAP_MS || 280);
const RATE_LIMIT_COOLDOWN_MS = 90 * 1000;

let rateLimitedUntil = 0;

function compactFilters(filters = {}) {
  const out = {};
  ['commodity', 'variety', 'state', 'district', 'market'].forEach((key) => {
    const value = filters[key] == null ? '' : String(filters[key]).trim();
    if (value) out[key] = value;
  });
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitedError(err) {
  return Boolean(err && (err.code === 'MARKET_RATE_LIMIT' || err.appStatus === 429));
}

function daysAgo(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function logSync(line) {
  console.log(`[MARKET SYNC] ${line}`);
}

async function ingestNormalized(cacheKey, records, context) {
  const stats = await store.ingest(cacheKey, records);
  logSync(
    `${context} fetched=${stats.fetched} inserted=${stats.inserted} skipped=${stats.skipped} persistence=${stats.persistence}`,
  );
  return stats;
}

async function syncCurrent(filters = {}) {
  const ogdFilters = compactFilters(filters);
  const key = store.cacheKey(ogdFilters);
  if (store.isFresh(key)) return { skipped: true, reason: 'fresh' };
  if (Date.now() < rateLimitedUntil) return { skipped: true, reason: 'rate_limited' };

  return store.withLock(key, async () => {
    if (store.isFresh(key)) return { skipped: true, reason: 'fresh' };
    try {
      const raw = await ogdClient.fetchRaw(ogdFilters);
      const records = normalizeRecords(raw.records);
      const stats = await ingestNormalized(key, records, `current ${raw.updated || 'snapshot'}`);
      return { ...stats, updated: raw.updated || null, title: raw.title || SOURCE };
    } catch (err) {
      if (isRateLimitedError(err)) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        logSync('current snapshot rate limited');
      }
      throw err;
    }
  });
}

async function syncHistoryDay(filters) {
  const iso = filters.date;
  if (!iso) return { fetched: 0, inserted: 0, skipped: 0 };
  if (Date.now() < rateLimitedUntil) return { skipped: true, reason: 'rate_limited' };

  const scoped = compactFilters(filters);
  const key = store.cacheKey({ ...scoped, historyDate: iso });
  if (store.isFresh(key)) return { skipped: true, reason: 'fresh' };

  return store.withLock(key, async () => {
    if (store.isFresh(key)) return { skipped: true, reason: 'fresh' };
    try {
      const raw = await ogdClient.fetchHistoryDay({
        commodity: filters.commodity,
        variety: filters.variety,
        state: filters.state,
        district: filters.district,
        market: filters.market,
        date: iso,
      });
      const records = normalizeRecords(raw.records);
      return ingestNormalized(key, records, `history ${iso}`);
    } catch (err) {
      if (isRateLimitedError(err)) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        logSync(`history ${iso} rate limited`);
      }
      throw err;
    }
  });
}

async function backfill(filters = {}, { days = BACKFILL_DAYS, maxRequests = LIVE_HISTORY_DAYS } = {}) {
  const scoped = compactFilters(filters);
  const existing = await store.query(scoped);
  const end = existing[0]?.date || new Date().toISOString().slice(0, 10);
  const start = daysAgo(end, Math.max(days - 1, 0));
  const pending = ogdClient.isoDateList(start, end, days)
    .reverse()
    .filter((iso) => !store.isFresh(store.cacheKey({ ...scoped, historyDate: iso })))
    .slice(0, Math.max(maxRequests, 0));

  const stats = [];
  for (const iso of pending) {
    if (Date.now() < rateLimitedUntil) {
      logSync('backfill stopped: rate limit cooldown');
      break;
    }
    try {
      const result = await syncHistoryDay({ ...scoped, date: iso });
      stats.push({ date: iso, ...result });
    } catch (err) {
      if (isRateLimitedError(err)) break;
      logSync(`history ${iso} error=${err.code || err.message}`);
      stats.push({ date: iso, error: err.code || 'MARKET_UNAVAILABLE', fetched: 0, inserted: 0, skipped: 0 });
    }
    await sleep(REQUEST_GAP_MS);
  }

  return {
    commodity: filters.commodity || '',
    state: filters.state || '',
    start,
    end,
    daysAttempted: stats.length,
    stats,
  };
}

async function ensureSnapshot(filters = {}) {
  try {
    await syncCurrent(filters);
  } catch (err) {
    if (!isRateLimitedError(err)) throw err;
  }
}

async function ensureHistory(filters = {}, days = LIVE_HISTORY_DAYS) {
  const liveDays = Math.min(Math.max(days, 1), LIVE_HISTORY_DAYS);
  try {
    await backfill(filters, { days: liveDays, maxRequests: liveDays });
  } catch (err) {
    if (!isRateLimitedError(err)) throw err;
  }
}

async function syncDaily(filters = {}) {
  await ensureSnapshot(filters);
  await backfill(filters, { days: 3, maxRequests: 3 });
  return store.coverage();
}

module.exports = {
  SOURCE,
  LIVE_HISTORY_DAYS,
  BACKFILL_DAYS,
  compactFilters,
  daysAgo,
  isRateLimitedError,
  syncCurrent,
  syncHistoryDay,
  backfill,
  ensureSnapshot,
  ensureHistory,
  syncDaily,
};
