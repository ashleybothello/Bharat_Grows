import { cropMarketPath, fetchMarketCrop, fetchMarketTrends } from '../market';
import { completeAction, dispatchSaathiAction, sleep, uid, waitForAction } from './bus';
import { statesForSoilGroup } from './places';

export const PAGE_ROUTE = {
  dashboard: '/app/dashboard',
  analyze: '/app/analyze',
  results: '/app/results',
  map: '/app/iot',
  gis: '/app/gis',
  history: '/app/history',
  market: '/app/market',
  profile: '/app/profile',
  beta: '/beta',
  satellite: '/app/satellite',
  weather: '/app/weather',
  irrigation: '/app/irrigation',
  pest: '/app/pest-detection',
  fertilizer: '/app/fertilizer',
  calendar: '/app/crop-calendar',
  water: '/app/water-footprint',
  sustainability: '/app/sustainability',
  schemes: '/app/gov-schemes',
  export: '/app/export-reports',
};

export const ACTION_PAGE = {
  openDashboard: 'dashboard',
  openAnalyze: 'analyze',
  openResults: 'results',
  openMap: 'map',
  openGIS: 'gis',
  openHistory: 'history',
  openMarket: 'market',
  openProfile: 'profile',
  openBeta: 'beta',
  openSatellite: 'satellite',
  openWeather: 'weather',
  openIrrigation: 'irrigation',
  openPest: 'pest',
  openFertilizer: 'fertilizer',
  openCalendar: 'calendar',
  openWater: 'water',
  openSustainability: 'sustainability',
  openSchemes: 'schemes',
  openExport: 'export',
  searchGISLocation: 'gis',
  selectGISState: 'gis',
  selectGISDistrict: 'gis',
  activateGISLayer: 'gis',
  deactivateGISLayer: 'gis',
  zoomToGISRegion: 'gis',
  selectNode: 'map',
  showNodeDetails: 'map',
  showNodeHistory: 'history',
  showNodeAnomaly: 'map',
  selectAnalysisNode: 'analyze',
  runAnalysis: 'analyze',
  showLatestAnalysis: 'results',
  showResults: 'results',
  searchMarketCrop: 'market',
  filterMarketState: 'market',
  filterMarketDistrict: 'market',
  showMarketPrice: 'market',
  showMarketTrend: 'market',
  selectHistoryNode: 'history',
  selectHistoryRange: 'history',
  showHistoryGraph: 'history',
};

function sameRoute(pathname, route) {
  if (!route) return true;
  if (pathname === route) return true;
  if (route === '/app/market' && String(pathname).startsWith('/app/market')) return true;
  return false;
}

async function runPageAction(action, timeout) {
  const id = action.id || uid(action.type);
  const pending = waitForAction(id, timeout);
  dispatchSaathiAction({ ...action, id });
  return pending;
}

export async function executePlan(plan, { navigate, pathname }) {
  const results = [];
  let path = pathname;
  const list = plan?.actions || [];

  for (const action of list) {
    const page = ACTION_PAGE[action.type];
    const route = page ? PAGE_ROUTE[page] : null;

    if (action.type === 'showMarketPrice' || action.type === 'showMarketTrend') {
      const commodity = action.commodity;
      if (!commodity) {
        results.push({ type: action.type, ok: false, error: 'no_crop' });
        continue;
      }
      const params = {
        state: action.state || '',
        district: action.district || '',
        range: action.range || '7d',
      };
      const href = cropMarketPath(commodity, params);
      navigate(href);
      path = href.split('?')[0];
      const fetched = await Promise.race([
        fetchMarketCrop(commodity, { state: params.state, district: params.district, sort: 'highest' }),
        sleep(8000).then(() => ({ ok: false, data: { success: false, message: 'timeout' } })),
      ]);
      let trend = null;
      if (action.type === 'showMarketTrend') {
        const trendRes = await fetchMarketTrends({
          commodity,
          state: params.state,
          district: params.district,
          range: params.range,
        });
        trend = trendRes.ok ? trendRes.data : null;
      }
      results.push({
        type: action.type,
        ok: Boolean(fetched.ok && fetched.data?.success),
        commodity,
        state: params.state,
        route: href,
        data: fetched.data,
        trend,
        error: fetched.ok ? null : (fetched.data?.message || 'market_unavailable'),
      });
      continue;
    }

    if (route && !sameRoute(path, route)) {
      navigate(route);
      path = route;
      await sleep(60);
    }

    if (action.type.startsWith('open')) {
      results.push({ type: action.type, ok: true, route: route || path });
      continue;
    }

    if (action.type === 'getLatestFarmStatus' || action.type === 'getLatestNodeTelemetry'
      || action.type === 'getLatestAnomalies' || action.type === 'getLatestCropPrediction'
      || action.type === 'getLatestWeatherPrediction' || action.type === 'getMarketSummary'
      || action.type === 'showLatestAnalysis') {
      results.push({ type: action.type, ok: true, deferred: true });
      continue;
    }

    const timeout = action.type === 'runAnalysis'
      ? 45000
      : (page === 'gis' ? 20000 : 14000);
    const result = await runPageAction(action, timeout);
    results.push({ type: action.type, ...result });
  }

  if (plan?.intent === 'GIS_SOIL_FILTER' && plan.soilGroup) {
    results.push({
      type: 'gisSoilGroup',
      ok: true,
      group: plan.soilGroup,
      states: statesForSoilGroup(plan.soilGroup.id),
    });
  }

  return results;
}

export function actionsFromChatPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.actions) && payload.actions.length) return payload.actions;
  const action = payload.action;
  if (!action || action === 'none') return [];
  const map = {
    navigate_analyze: { type: 'openAnalyze' },
    navigate_results: { type: 'openResults' },
    navigate_history: { type: 'openHistory' },
    navigate_insights: { type: 'openResults' },
    navigate_iot: { type: 'openMap' },
    navigate_market: { type: 'openMarket' },
    navigate_gis: { type: 'openGIS' },
    navigate_dashboard: { type: 'openDashboard' },
    navigate_satellite: { type: 'openSatellite' },
  };
  if (map[action]) return [map[action]];
  return [];
}

export { completeAction };
