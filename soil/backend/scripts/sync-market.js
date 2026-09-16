const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const sync = require('../services/market/marketSync');
const store = require('../services/market/marketStore');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

(async () => {
  const commodity = arg('commodity', 'Wheat');
  const state = arg('state', 'Madhya Pradesh');
  const days = Number(arg('days', String(sync.BACKFILL_DAYS))) || sync.BACKFILL_DAYS;
  const snapshotOnly = flag('snapshot');

  console.log(`[MARKET SYNC] start commodity=${commodity} state=${state} days=${days} persistence=${store.persistence()}`);
  await sync.ensureSnapshot({ commodity, state });
  if (!snapshotOnly) {
    await sync.backfill({ commodity, state }, { days, maxRequests: days });
  }
  const coverage = await store.coverage();
  console.log('[MARKET SYNC] coverage', JSON.stringify(coverage));
})().catch((err) => {
  console.error('[MARKET SYNC]', err.code || err.message);
  process.exitCode = 1;
});
