require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const OGD_URL = `https://api.data.gov.in/resource/${RESOURCE_ID}`;

async function main() {
  const key = String(process.env.DATA_GOV_API_KEY || '').trim();
  console.log('DATA_GOV_API_KEY loaded:', Boolean(key));
  if (!key) {
    console.log('Government mandi API request: skipped');
    process.exit(1);
  }

  const response = await axios.get(OGD_URL, {
    params: {
      'api-key': key,
      format: 'json',
      limit: 20,
      offset: 0,
    },
    timeout: 25000,
    validateStatus: () => true,
  });

  const data = response.data;
  const records = Array.isArray(data?.records) ? data.records : [];
  const ok = response.status === 200 && records.length > 0;
  console.log('Government mandi API HTTP status:', response.status);
  console.log('Government mandi API request:', ok ? 'success' : 'failed');
  console.log('Records received:', records.length);
  if (data && typeof data === 'object') {
    console.log('Response keys:', Object.keys(data).join(', '));
    if (data.title) console.log('Dataset title:', data.title);
    if (data.total != null) console.log('Reported total:', data.total);
    if (data.message) console.log('API message:', String(data.message).slice(0, 200));
    if (data.status) console.log('API status field:', data.status);
  }
  if (records[0] && typeof records[0] === 'object') {
    console.log('Record field names:', Object.keys(records[0]).join(', '));
    const sample = records[0];
    console.log('Sample commodity:', sample.commodity || sample.Commodity || '');
    console.log('Sample market:', sample.market || sample.Market || '');
    console.log('Sample state:', sample.state || sample.State || '');
    console.log('Sample district:', sample.district || sample.District || '');
    console.log('Sample arrival_date:', sample.arrival_date || sample.Arrival_Date || '');
    console.log('Sample min/modal/max:', sample.min_price, sample.modal_price, sample.max_price);
  }
}

main().catch((err) => {
  console.log('Government mandi API request: failed');
  console.log('Error status:', err.response?.status || 'network');
  console.log('Error code:', err.code || '');
  process.exit(1);
});
