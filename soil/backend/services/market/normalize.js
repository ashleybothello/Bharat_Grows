const SOURCE = 'Government OGD / AGMARKNET';

function pick(row, names) {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== '') return String(row[name]).trim();
  }
  return '';
}

function parsePrice(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const mdy = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (mdy) {
    const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const mm = months[mdy[2]];
    if (!mm) return null;
    return `${mdy[3]}-${mm}-${mdy[1].padStart(2, '0')}`;
  }
  return null;
}

function recordKey(row) {
  return [row.commodity, row.variety, row.market, row.state, row.district, row.date].join('|').toLowerCase();
}

function normalizeRecord(row = {}) {
  const commodity = pick(row, ['commodity', 'Commodity', 'commodity_name']);
  const market = pick(row, ['market', 'Market', 'mandi']);
  const state = pick(row, ['state', 'State']);
  const date = parseDate(pick(row, ['arrival_date', 'Arrival_Date', 'Arrival Date', 'date']));
  const modalPrice = parsePrice(pick(row, ['modal_price', 'Modal_Price', 'Modal Price', 'modalPrice', 'modal']));
  if (!commodity || !market || !state || !date || modalPrice == null || modalPrice <= 0) return null;

  const minPrice = parsePrice(pick(row, ['min_price', 'Min_Price', 'Min Price', 'minPrice']));
  const maxPrice = parsePrice(pick(row, ['max_price', 'Max_Price', 'Max Price', 'maxPrice']));

  return {
    commodity,
    variety: pick(row, ['variety', 'Variety']) || 'Not specified',
    grade: pick(row, ['grade', 'Grade']),
    market,
    state,
    district: pick(row, ['district', 'District']),
    date,
    minPrice,
    maxPrice,
    modalPrice,
    unit: '₹/quintal',
    source: SOURCE,
  };
}

function normalizeRecords(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const next = normalizeRecord(row);
    if (!next) continue;
    const key = recordKey(next);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.market.localeCompare(b.market)));
}

function matchesFilters(row, filters = {}) {
  const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  const has = (a, b) => String(a || '').toLowerCase().includes(String(b || '').toLowerCase());
  if (filters.commodity && !eq(row.commodity, filters.commodity)) return false;
  if (filters.variety && !has(row.variety, filters.variety) && !eq(row.variety, filters.variety)) return false;
  if (filters.state && !eq(row.state, filters.state)) return false;
  if (filters.district && !eq(row.district, filters.district)) return false;
  if (filters.market && !eq(row.market, filters.market)) return false;
  if (filters.date && row.date !== filters.date) return false;
  return true;
}

module.exports = {
  SOURCE,
  parseDate,
  parsePrice,
  recordKey,
  normalizeRecord,
  normalizeRecords,
  matchesFilters,
};
