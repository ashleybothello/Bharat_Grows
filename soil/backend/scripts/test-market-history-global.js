const crops = [
  'Wheat',
  'Bajra(Pearl Millet/Cumbu)',
  'Onion',
  'Potato',
  'Tomato',
  'Maize',
  'Cotton',
  'Soyabean',
];

async function trends(commodity, range) {
  const url = `http://127.0.0.1:5005/api/market/trends?commodity=${encodeURIComponent(commodity)}&range=${range}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  const points = data.data || data.observations || [];
  return {
    status: res.status,
    ok: Boolean(data.success),
    scope: data.scope,
    days: points.length,
    dates: points.map((p) => p.date),
    latest: data.latestDate,
    leak: /api-key|DATA_GOV/i.test(JSON.stringify(data)),
  };
}

(async () => {
  const status = await fetch('http://127.0.0.1:5005/api/market/status').then((r) => r.json());
  console.log('db', JSON.stringify({
    persistence: status.persistence,
    observations: status.observations,
    commodities: status.commodities,
    states: status.states,
    mandis: status.mandis,
    first: status.first_date,
    last: status.last_date,
  }));
  for (const crop of crops) {
    const d7 = await trends(crop, '7d');
    const d1 = await trends(crop, '1m');
    console.log([
      crop,
      `7d=${d7.days}`,
      `1m=${d1.days}`,
      `latest=${d7.latest || d1.latest}`,
      `scope=${d7.scope}`,
      `dates7=${d7.dates.join(',')}`,
      d7.ok && !d7.leak ? 'ok' : 'fail',
    ].join(' | '));
  }
  const after = await fetch('http://127.0.0.1:5005/api/market/status').then((r) => r.json());
  console.log('db_after', JSON.stringify({
    persistence: after.persistence,
    observations: after.observations,
    commodities: after.commodities,
    states: after.states,
    mandis: after.mandis,
    first: after.first_date,
    last: after.last_date,
  }));
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
