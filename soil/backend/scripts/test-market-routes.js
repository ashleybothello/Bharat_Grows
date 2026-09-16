const base = 'http://localhost:5005';

async function get(path) {
  const started = Date.now();
  const res = await fetch(base + path);
  const data = await res.json().catch(() => ({}));
  const ms = Date.now() - started;
  const record = data.records?.[0] || data.commodities?.[0] || data.latest || null;
  console.log(path, 'status', res.status, ms + 'ms', 'success', Boolean(data.success), 'count', data.count ?? data.records?.length ?? data.commodities?.length ?? 0, 'source', data.source || '');
  if (record) {
    console.log('  sample', JSON.stringify({
      commodity: record.commodity,
      market: record.market,
      state: record.state,
      district: record.district,
      date: record.date,
      minPrice: record.minPrice,
      modalPrice: record.modalPrice,
      maxPrice: record.maxPrice,
    }));
  }
  if (!data.success) console.log('  error', data.code, data.message);
  return { res, data };
}

(async () => {
  await get('/api/market/prices?limit=5');
  await get('/api/market/summary');
  await get('/api/market/prices?commodity=Wheat&state=Madhya%20Pradesh&limit=5');
})().catch((err) => {
  console.error('request_failed', err.message);
  process.exit(1);
});
