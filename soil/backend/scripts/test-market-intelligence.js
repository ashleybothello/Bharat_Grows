const base = 'http://127.0.0.1:5005';

async function get(path) {
  const started = Date.now();
  const res = await fetch(base + path);
  const data = await res.json().catch(() => ({}));
  return { path, status: res.status, ms: Date.now() - started, data };
}

function leak(obj) {
  const text = JSON.stringify(obj);
  return /api-key|DATA_GOV/i.test(text);
}

(async () => {
  const root = await get('/');
  console.log('root', root.status, root.data.message || root.data.success);

  const status = await get('/api/market/status');
  console.log('status', status.status, JSON.stringify({
    persistence: status.data.persistence,
    observations: status.data.observations,
    commodities: status.data.commodities,
    first: status.data.first_date,
    last: status.data.last_date,
    leak: leak(status.data),
  }));

  const summary = await get('/api/market/summary');
  const firstCrop = summary.data.commodities?.[0];
  console.log('summary', summary.status, 'count', summary.data.count, 'source', summary.data.source, 'sample', firstCrop && {
    commodity: firstCrop.commodity,
    modal: firstCrop.modalPrice,
    date: firstCrop.date,
    changePercent: firstCrop.changePercent,
  }, 'leak', leak(summary.data));

  const wheat = await get('/api/market/crops/Wheat?state=' + encodeURIComponent('Madhya Pradesh') + '&range=7d');
  const w = wheat.data;
  const chartNulls = (w.chart || []).filter((p) => p.modal == null).length;
  const obs = w.observations || [];
  const fake = obs.some((p) => p.modal == null || p.modal <= 0);
  console.log('wheat7d', wheat.status, JSON.stringify({
    success: w.success,
    latest: w.latest && { market: w.latest.market, date: w.latest.date, modal: w.latest.modalPrice },
    metrics: w.metrics,
    signal: w.signal && w.signal.code,
    obsDays: obs.map((p) => p.date),
    chartPoints: (w.chart || []).length,
    chartGaps: chartNulls,
    ranges: Object.fromEntries(Object.entries(w.ranges || {}).map(([k, v]) => [k, v.enabled])),
    seriesLabel: w.seriesLabel,
    mandis: (w.markets || []).length,
    fakeObservation: fake,
    leak: leak(w),
  }));

  const wheatAgain = await get('/api/market/crops/Wheat?state=' + encodeURIComponent('Madhya Pradesh') + '&range=7d');
  console.log('wheat7d_repeat_ms', wheatAgain.ms, 'obs', (wheatAgain.data.observations || []).length);

  const history = await get('/api/market/crops/Wheat/history?state=' + encodeURIComponent('Madhya Pradesh') + '&range=7d');
  console.log('history', history.status, 'obs', (history.data.observations || []).length, 'leak', leak(history.data));

  const trends = await get('/api/market/trends?commodity=Wheat&state=' + encodeURIComponent('Madhya Pradesh') + '&range=1m');
  console.log('trends1m', trends.status, 'enabled', trends.data.ranges, 'obs', (trends.data.series || []).length);

  const mandis = await get('/api/market/mandis?commodity=Wheat&state=' + encodeURIComponent('Madhya Pradesh') + '&sort=lowest');
  console.log('mandis', mandis.status, 'count', mandis.data.count, 'lowest', mandis.data.lowestModal, 'highest', mandis.data.highestModal);

  const coverage = await get('/api/market/status');
  console.log('coverage_after', JSON.stringify({
    persistence: coverage.data.persistence,
    observations: coverage.data.observations,
    commodities: coverage.data.commodities,
    states: coverage.data.states,
    mandis: coverage.data.mandis,
    first_date: coverage.data.first_date,
    last_date: coverage.data.last_date,
  }));
})().catch((err) => {
  console.error('test_failed', err.message);
  process.exit(1);
});
