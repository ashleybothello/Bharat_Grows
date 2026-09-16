require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const KEY = String(process.env.DATA_GOV_API_KEY || '').trim();
const RESOURCE = '35985678-0d79-46b4-9ed6-6f13308a1d24';
const DATES = ['10/09/2026', '11/09/2026', '12/09/2026', '13/09/2026', '14/09/2026', '15/09/2026'];

async function fetchDate(date) {
  const response = await axios.get(`https://api.data.gov.in/resource/${RESOURCE}`, {
    params: {
      'api-key': KEY,
      format: 'json',
      limit: 1000,
      offset: 0,
      'filters[Commodity]': 'Wheat',
      'filters[State]': 'Madhya Pradesh',
      'filters[Arrival_Date]': date,
    },
    timeout: 35000,
    validateStatus: () => true,
  });
  const records = Array.isArray(response.data?.records) ? response.data.records : [];
  const sample = records[0] || null;
  return {
    requested: date,
    http: response.status,
    total: response.data?.total ?? 0,
    count: records.length,
    sample: sample && {
      Commodity: sample.Commodity,
      Variety: sample.Variety,
      State: sample.State,
      District: sample.District,
      Market: sample.Market,
      Arrival_Date: sample.Arrival_Date,
      Min_Price: sample.Min_Price,
      Modal_Price: sample.Modal_Price,
      Max_Price: sample.Max_Price,
    },
  };
}

(async () => {
  console.log('DATA_GOV_API_KEY loaded:', Boolean(KEY));
  console.log('Government historical resource:', RESOURCE);
  const results = [];
  for (const date of DATES) {
    const row = await fetchDate(date);
    results.push(row);
    console.log('DATE', JSON.stringify(row));
  }
  const withData = results.filter((row) => row.count > 0);
  console.log('Dates with real records:', withData.map((row) => row.requested).join(', ') || 'none');
  console.log('Historical records in this probe:', withData.reduce((sum, row) => sum + row.count, 0));
})().catch((err) => {
  console.log('Government mandi API request: failed', err.code || err.message);
  process.exit(1);
});
