import { API_URL } from './api';

export function marketQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && String(value).trim() !== '') search.set(key, String(value).trim());
  });
  const q = search.toString();
  return q ? `?${q}` : '';
}

async function getJson(path) {
  const res = await fetch(`${API_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function fetchMarketPrices(params) {
  return getJson(`/api/market/prices${marketQuery(params)}`);
}

export function fetchMarketSummary(params) {
  return getJson(`/api/market/summary${marketQuery(params)}`);
}

export function fetchMarketCrop(commodity, params) {
  return getJson(`/api/market/crop${marketQuery({ ...params, commodity })}`);
}

export function fetchMarketHistory(commodity, params) {
  return getJson(`/api/market/crops/${encodeURIComponent(commodity)}/history${marketQuery(params)}`);
}

export function fetchMarketTrends(params) {
  return getJson(`/api/market/trends${marketQuery(params)}`);
}

export function fetchMarketMandis(params) {
  return getJson(`/api/market/mandis${marketQuery(params)}`);
}

export function cropMarketPath(commodity, params = {}) {
  return `/app/market/crop/${encodeURIComponent(commodity)}${marketQuery(params)}`;
}

export function formatInr(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n}%`;
}

export function formatChange(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}₹${abs}`;
}

export function formatMandiDate(iso) {
  if (!iso) return 'Latest available mandi data';
  const [year, month, day] = String(iso).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = months[Number(month) - 1];
  if (!m || !day) return iso;
  return `${Number(day)} ${m} ${year}`;
}

export function moveClass(value) {
  if (value == null) return 'flat';
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}
