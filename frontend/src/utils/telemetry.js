import axios from 'axios';
import { API_URL } from './api';
import { readSession } from './auth';

function authHeaders() {
  const token = readSession()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function client() {
  return axios.create({
    baseURL: API_URL,
    timeout: 20000,
    headers: { ...authHeaders() },
  });
}

export async function fetchNodes() {
  const { data } = await client().get('/api/nodes');
  return data;
}

export async function fetchNode(nodeId) {
  const { data } = await client().get(`/api/nodes/${encodeURIComponent(nodeId)}`);
  return data;
}

export async function fetchTelemetryLatest() {
  const { data } = await client().get('/api/telemetry/latest');
  return data;
}

export async function fetchTelemetryHistory(params = {}) {
  const { data } = await client().get('/api/telemetry/history', { params });
  return data;
}

export async function fetchTelemetryTrends({ sensor, range, nodeId }) {
  const { data } = await client().get('/api/telemetry/trends', {
    params: { sensor, range, nodeId: nodeId || undefined },
  });
  return data;
}

export async function fetchAnomalies(params = {}) {
  const { data } = await client().get('/api/anomalies', { params });
  return data;
}

export async function fetchAnalysisInput({ scope = 'farm', nodeId } = {}) {
  const { data } = await client().get('/api/telemetry/analysis-input', {
    params: { scope, nodeId: nodeId || undefined },
  });
  return data;
}

export async function triggerAnomaly({ nodeId, sensor, value, ticks }) {
  const { data } = await client().post('/api/simulation/anomaly', {
    nodeId, sensor, value, ticks,
  });
  return data;
}

export async function clearAnomaly(nodeId) {
  const { data } = await client().post('/api/simulation/anomaly/clear', { nodeId });
  return data;
}

export async function fetchSimulationStatus() {
  const { data } = await client().get('/api/simulation/status');
  return data;
}

/** Public Hardware Beta live read. Separate from simulated /api/nodes. */
export async function fetchHardwareLive() {
  const { data } = await axios.get(`${API_URL}/api/hardware/live`, { timeout: 8000 });
  return data;
}

export async function fetchHardwareHistory({ deviceId, limit = 120 } = {}) {
  const { data } = await axios.get(`${API_URL}/api/hardware/history`, {
    timeout: 8000,
    params: { deviceId, limit },
  });
  return data;
}

export async function saveAlertEmail(email) {
  const { data } = await client().post('/api/auth/alert-email', { email });
  return data;
}

export function telemetryErrorMessage(error, t) {
  const payload = error?.response?.data;
  const code = payload?.code;
  if (code === 'TELEMETRY_DB_UNAVAILABLE') return t.pg_map_db;
  if (code === 'NOT_AUTHENTICATED') return t.pg_map_auth;
  if (code === 'NO_READINGS_YET') return t.pg_map_waiting;
  if (code === 'HARDWARE_LIVE_FAILED') return t.pg_hw_fail || t.pg_map_fail;
  if (!error?.response) return t.pg_err_backend_down;
  return payload?.error || t.pg_map_fail;
}
