/**
 * SAATHI page-control bus.
 * Pages subscribe to named actions. If a page is not mounted yet, the action
 * waits in a queue until that page registers.
 */

const listeners = new Set();
let pending = [];
const waiters = new Map();
const readyPages = new Set();

let uiContext = {
  currentRoute: '',
  selectedNode: null,
  selectedGISRegion: null,
  selectedGISLayer: null,
  selectedCrop: null,
  selectedMarketState: null,
  selectedMarketDistrict: null,
  lastNodeNumber: null,
  lastNodeId: null,
  lastPlace: null,
  lastDistrict: null,
  lastCrop: null,
  lastMarketState: null,
  lastMarketDistrict: null,
  lastRange: null,
  lastSensor: null,
  lastIntent: null,
  lastFocusType: null,
  primaryCrop: null,
};

export function getUiContext() {
  return { ...uiContext };
}

export function setUiContext(patch) {
  uiContext = { ...uiContext, ...patch };
}

export function rememberSaathiFocus(plan, results = []) {
  if (!plan) return;
  const nodeHit = (results || []).find((row) => row.nodeNumber || row.nodeId);
  const gisHit = (results || []).find((row) => row.iso || (row.name && row.type?.includes('GIS')));
  const patch = { lastIntent: plan.intent || null };
  if (plan.nodeNumber != null) patch.lastNodeNumber = plan.nodeNumber;
  if (nodeHit?.nodeId) patch.lastNodeId = nodeHit.nodeId;
  if (nodeHit?.nodeNumber != null) patch.lastNodeNumber = nodeHit.nodeNumber;
  if (plan.place) patch.lastPlace = plan.place;
  if (plan.district) patch.lastDistrict = plan.district;
  if (gisHit?.name && plan.place) patch.lastPlace = plan.place;
  if (plan.crop) patch.lastCrop = plan.crop;
  if (plan.range) patch.lastRange = plan.range;
  if (plan.sensorKey) patch.lastSensor = plan.sensorKey;
  const market = (results || []).find((row) => row.commodity);
  if (market?.commodity) patch.lastCrop = market.commodity;
  if (market?.state) patch.lastMarketState = market.state;
  if (plan.place?.name && (plan.intent || '').includes('MARKET')) patch.lastMarketState = plan.place.name;
  if (plan.district?.name && (plan.intent || '').includes('MARKET')) patch.lastMarketDistrict = plan.district.name;
  const intent = String(plan.intent || '');
  if (intent.includes('GIS')) patch.lastFocusType = 'gis';
  else if (intent.includes('MARKET')) patch.lastFocusType = 'market';
  else if (intent.includes('NODE') || intent.includes('MAP') || intent.includes('HISTORY') || intent === 'RUN_ANALYSIS') patch.lastFocusType = 'node';
  else if (intent.includes('ANALYSIS')) patch.lastFocusType = 'analysis';
  else if (intent.includes('WEATHER')) patch.lastFocusType = 'weather';
  setUiContext(patch);
}

export function uid(prefix = 'saathi') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emitPageReady(page) {
  readyPages.add(page);
  window.dispatchEvent(new CustomEvent('bharatgrow:page-ready', { detail: { page } }));
}

export function emitPageGone(page) {
  readyPages.delete(page);
}

export function isPageReady(page) {
  return readyPages.has(page);
}

export function hasActionListener(type) {
  return [...listeners].some((item) => item.types.includes(type));
}

export function subscribeSaathi(types, fn) {
  const listener = { types, fn };
  listeners.add(listener);
  const queued = pending.filter((action) => types.includes(action.type));
  pending = pending.filter((action) => !types.includes(action.type));
  queued.forEach((action) => {
    try {
      fn(action);
    } catch (err) {
      completeAction(action.id, { ok: false, type: action.type, error: err.message || 'handler' });
    }
  });
  return () => listeners.delete(listener);
}

export function dispatchSaathiAction(action) {
  const hits = [...listeners].filter((item) => item.types.includes(action.type));
  if (hits.length) {
    hits.forEach((item) => item.fn(action));
    return;
  }
  pending.push(action);
}

export function waitForAction(id, ms = 12000) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      waiters.delete(id);
      resolve({ id, ok: false, error: 'timeout' });
    }, ms);
    waiters.set(id, (result) => {
      window.clearTimeout(timer);
      resolve({ id, ...result });
    });
  });
}

export function completeAction(id, result) {
  const fn = waiters.get(id);
  if (!fn) return;
  waiters.delete(id);
  fn(result);
}

export function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
