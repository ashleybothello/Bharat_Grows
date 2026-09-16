export const PAGE_CAPABILITIES = {
  dashboard: {
    route: '/app/dashboard',
    can: ['farm summary', 'node overview', 'alerts'],
  },
  analyze: {
    route: '/app/analyze',
    can: ['sensor selection', 'analysis', 'crop AI', 'weather intelligence'],
  },
  map: {
    route: '/app/iot',
    can: ['hardware nodes', 'node health', 'anomalies'],
  },
  gis: {
    route: '/app/gis',
    can: ['India map', 'state', 'district', 'soil layer', 'crop suitability', 'satellite layer'],
  },
  history: {
    route: '/app/history',
    can: ['telemetry history', 'node history', 'time ranges'],
  },
  market: {
    route: '/app/market',
    can: ['crop', 'state', 'district', 'mandi price', 'trends'],
  },
  results: {
    route: '/app/results',
    can: ['crop prediction', 'rainfall/weather output', 'analysis conditions'],
  },
};
