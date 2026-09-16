require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const KEY = String(process.env.DATA_GOV_API_KEY || '').trim();
const CURRENT = '9ef84268-d588-465a-a308-a864a43d0070';
const VARIETY = '35985678-0d79-46b4-9ed6-6f13308a1d24';

function summarize(records) {
  const dates = {};
  for (const row of records) {
    const date = row.arrival_date || row.Arrival_Date || row['Arrival Date'] || '';
    dates[date] = (dates[date] || 0) + 1;
  }
  const sorted = Object.keys(dates).sort();
  return {
    count: records.length,
    uniqueDates: sorted.length,
    earliest: sorted[0] || null,
    latest: sorted[sorted.length - 1] || null,
    dateCounts: dates,
    fields: records[0] ? Object.keys(records[0]) : [],
  };
}

async function query(resourceId, extra = {}, limit = 50) {
  const url = `https://api.data.gov.in/resource/${resourceId}`;
  const response = await axios.get(url, {
    params: {
      'api-key': KEY,
      format: 'json',
      limit,
      offset: 0,
      ...extra,
    },
    timeout: 35000,
    validateStatus: () => true,
  });
  const data = response.data || {};
  const records = Array.isArray(data.records) ? data.records : [];
  return {
    http: response.status,
    apiStatus: data.status || null,
    message: data.message ? String(data.message).slice(0, 180) : null,
    title: data.title || null,
    total: data.total ?? null,
    count: records.length,
    summary: summarize(records),
  };
}

async function paginateDates(resourceId, extra, pages = 8, pageSize = 1000) {
  const dates = new Map();
  let total = 0;
  let fields = [];
  for (let page = 0; page < pages; page += 1) {
    const url = `https://api.data.gov.in/resource/${resourceId}`;
    const response = await axios.get(url, {
      params: {
        'api-key': KEY,
        format: 'json',
        limit: pageSize,
        offset: page * pageSize,
        ...extra,
      },
      timeout: 40000,
      validateStatus: () => true,
    });
    const records = Array.isArray(response.data?.records) ? response.data.records : [];
    if (!records.length) break;
    if (!fields.length && records[0]) fields = Object.keys(records[0]);
    total += records.length;
    for (const row of records) {
      const date = row.arrival_date || row.Arrival_Date || row['Arrival Date'] || '';
      dates.set(date, (dates.get(date) || 0) + 1);
    }
    if (records.length < pageSize) break;
  }
  const sorted = [...dates.keys()].filter(Boolean).sort();
  return {
    fetched: total,
    uniqueDates: sorted.length,
    earliest: sorted[0] || null,
    latest: sorted[sorted.length - 1] || null,
    dateCounts: Object.fromEntries([...dates.entries()].sort()),
    fields,
  };
}

(async () => {
  console.log('DATA_GOV_API_KEY loaded:', Boolean(KEY));
  if (!KEY) process.exit(1);

  const dateTries = [
    { label: 'filters[arrival_date]=15/09/2026', extra: { 'filters[arrival_date]': '15/09/2026' } },
    { label: 'filters[arrival_date]=10/09/2026', extra: { 'filters[arrival_date]': '10/09/2026' } },
    { label: 'filters[arrival_date]=2026-09-10', extra: { 'filters[arrival_date]': '2026-09-10' } },
    { label: 'filters[arrival_date]=10-Sep-2026', extra: { 'filters[arrival_date]': '10-Sep-2026' } },
    { label: 'filters[Arrival_Date]=15/09/2026', extra: { 'filters[Arrival_Date]': '15/09/2026' } },
    { label: 'filters[Arrival_Date]=10/09/2026', extra: { 'filters[Arrival_Date]': '10/09/2026' } },
  ];

  console.log('\n=== CURRENT RESOURCE 9ef84268 ===');
  const currentBase = await query(CURRENT, { 'filters[commodity]': 'Wheat', 'filters[state]': 'Madhya Pradesh' }, 100);
  console.log('Wheat+MP unfiltered-by-date', JSON.stringify({
    http: currentBase.http,
    apiStatus: currentBase.apiStatus,
    title: currentBase.title,
    total: currentBase.total,
    count: currentBase.count,
    earliest: currentBase.summary.earliest,
    latest: currentBase.summary.latest,
    uniqueDates: currentBase.summary.uniqueDates,
    dateCounts: currentBase.summary.dateCounts,
    fields: currentBase.summary.fields,
    message: currentBase.message,
  }));

  for (const trial of dateTries) {
    const result = await query(CURRENT, {
      'filters[commodity]': 'Wheat',
      'filters[state]': 'Madhya Pradesh',
      ...trial.extra,
    }, 20);
    console.log('TRY', trial.label, JSON.stringify({
      http: result.http,
      count: result.count,
      total: result.total,
      uniqueDates: result.summary.uniqueDates,
      dateCounts: result.summary.dateCounts,
      message: result.message,
    }));
  }

  const currentPages = await paginateDates(CURRENT, {
    'filters[commodity]': 'Wheat',
    'filters[state]': 'Madhya Pradesh',
  }, 10, 1000);
  console.log('Wheat+MP paginated dates', JSON.stringify(currentPages));

  console.log('\n=== VARIETY-WISE RESOURCE 35985678 ===');
  const varietyBase = await query(VARIETY, {}, 20);
  console.log('unfiltered', JSON.stringify({
    http: varietyBase.http,
    apiStatus: varietyBase.apiStatus,
    title: varietyBase.title,
    total: varietyBase.total,
    count: varietyBase.count,
    earliest: varietyBase.summary.earliest,
    latest: varietyBase.summary.latest,
    uniqueDates: varietyBase.summary.uniqueDates,
    dateCounts: varietyBase.summary.dateCounts,
    fields: varietyBase.summary.fields,
    message: varietyBase.message,
  }));

  const varietyWheat = await query(VARIETY, { 'filters[Commodity]': 'Wheat', 'filters[State]': 'Madhya Pradesh' }, 100);
  console.log('Wheat+MP PascalCase', JSON.stringify({
    http: varietyWheat.http,
    count: varietyWheat.count,
    total: varietyWheat.total,
    earliest: varietyWheat.summary.earliest,
    latest: varietyWheat.summary.latest,
    uniqueDates: varietyWheat.summary.uniqueDates,
    dateCounts: varietyWheat.summary.dateCounts,
    fields: varietyWheat.summary.fields,
    message: varietyWheat.message,
  }));

  const varietyWheatLower = await query(VARIETY, { 'filters[commodity]': 'Wheat', 'filters[state]': 'Madhya Pradesh' }, 50);
  console.log('Wheat+MP lowercase', JSON.stringify({
    http: varietyWheatLower.http,
    count: varietyWheatLower.count,
    total: varietyWheatLower.total,
    earliest: varietyWheatLower.summary.earliest,
    latest: varietyWheatLower.summary.latest,
    uniqueDates: varietyWheatLower.summary.uniqueDates,
    dateCounts: varietyWheatLower.summary.dateCounts,
    message: varietyWheatLower.message,
  }));

  const varietyDateTries = [
    { label: 'Arrival_Date 15/09/2026', extra: { 'filters[Arrival_Date]': '15/09/2026' } },
    { label: 'Arrival_Date 10/09/2026', extra: { 'filters[Arrival_Date]': '10/09/2026' } },
    { label: 'Arrival_Date 2026-09-10', extra: { 'filters[Arrival_Date]': '2026-09-10' } },
    { label: 'arrival_date 10/09/2026', extra: { 'filters[arrival_date]': '10/09/2026' } },
  ];
  for (const trial of varietyDateTries) {
    const result = await query(VARIETY, {
      'filters[Commodity]': 'Wheat',
      'filters[State]': 'Madhya Pradesh',
      ...trial.extra,
    }, 20);
    console.log('TRY', trial.label, JSON.stringify({
      http: result.http,
      count: result.count,
      total: result.total,
      uniqueDates: result.summary.uniqueDates,
      dateCounts: result.summary.dateCounts,
      message: result.message,
    }));
  }

  const varietyPages = await paginateDates(VARIETY, {
    'filters[Commodity]': 'Wheat',
    'filters[State]': 'Madhya Pradesh',
  }, 8, 1000);
  console.log('Wheat+MP variety paginated dates', JSON.stringify(varietyPages));
})().catch((err) => {
  console.log('Government mandi API request: failed');
  console.log('Error status:', err.response?.status || err.code || 'network');
  process.exit(1);
});
