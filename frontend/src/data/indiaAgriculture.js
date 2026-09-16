/**
 * State-level agricultural attributes joined onto geoBoundaries ADM1 polygons.
 *
 * Soil groups follow ICAR–NBSS&LUP major soil regions of India (dominant group
 * at STATE / UT level). This is not a cadastral or farm-level soil map.
 *
 * Crop lists follow ICAR agro-climatic grouping and the same regional crop
 * families already used on Analyze. They are suitability notes, not ML output
 * and not a yield forecast.
 */

export const SOIL_GROUPS = {
  alluvial: {
    id: 'alluvial',
    label: 'Alluvial',
    color: '#d4a06a',
    texture: 'Loamy to clayey',
    fertility: 'High',
    phRange: '6.5 – 8.0',
    organicCarbon: 'Moderate',
    note: 'Indo-Gangetic and coastal alluvium. Typical of canal-irrigated cereal belts.',
  },
  black: {
    id: 'black',
    label: 'Black / Regur',
    color: '#4a4540',
    texture: 'Clay (shrink–swell)',
    fertility: 'High in moisture years',
    phRange: '7.0 – 8.5',
    organicCarbon: 'Low to moderate',
    note: 'Deccan trap basaltic soils. Cotton, soybean and sorghum belts.',
  },
  red: {
    id: 'red',
    label: 'Red',
    color: '#a45c38',
    texture: 'Sandy loam to clay loam',
    fertility: 'Moderate; often P-deficient',
    phRange: '5.5 – 7.0',
    organicCarbon: 'Low to moderate',
    note: 'Peninsular and eastern uplands. Responds to organic matter and phosphorus.',
  },
  laterite: {
    id: 'laterite',
    label: 'Laterite',
    color: '#c17a4a',
    texture: 'Gravelly to clayey',
    fertility: 'Low to moderate',
    phRange: '4.8 – 6.2',
    organicCarbon: 'Low',
    note: 'High-rainfall western coast and hills. Plantation and spice country.',
  },
  arid: {
    id: 'arid',
    label: 'Arid / Desert',
    color: '#cbb889',
    texture: 'Sandy',
    fertility: 'Low',
    phRange: '7.5 – 8.8',
    organicCarbon: 'Very low',
    note: 'Western dry region. Hardy oilseeds, pulses and irrigated pockets.',
  },
  mountain: {
    id: 'mountain',
    label: 'Forest & Mountain',
    color: '#4e6a48',
    texture: 'Loamy, often shallow',
    fertility: 'Variable',
    phRange: '4.5 – 6.5',
    organicCarbon: 'Moderate to high',
    note: 'Himalayan and north-eastern hills. Temperate fruit, tea and spices.',
  },
  saline: {
    id: 'saline',
    label: 'Saline / Alkaline',
    color: '#7d8b96',
    texture: 'Variable',
    fertility: 'Constrained by salts',
    phRange: '8.0 – 9.5',
    organicCarbon: 'Low',
    note: 'Patches in arid and coastal belts. Needs drainage and salt-tolerant crops.',
  },
  peaty: {
    id: 'peaty',
    label: 'Peaty / Marshy',
    color: '#5a4638',
    texture: 'Organic, poorly drained',
    fertility: 'High organic, poor aeration',
    phRange: '3.5 – 5.5',
    organicCarbon: 'High',
    note: 'Kerala kayals, Sundarbans and some north-eastern wetlands.',
  },
};

const S = SOIL_GROUPS;

/** Dominant soil + indicative crops keyed by geoBoundaries shapeISO. */
export const STATE_AGRI = {
  'IN-AN': { region: 'Island territories', soil: S.laterite, crops: ['Coconut', 'Rice', 'Areacanut'] },
  'IN-AP': { region: 'East Coast Plain & Deccan', soil: S.red, crops: ['Rice', 'Chilli', 'Groundnut', 'Cotton', 'Mango'] },
  'IN-AR': { region: 'Eastern Himalaya', soil: S.mountain, crops: ['Rice', 'Maize', 'Orange', 'Ginger'] },
  'IN-AS': { region: 'Brahmaputra Valley', soil: S.alluvial, crops: ['Tea', 'Rice', 'Jute', 'Mustard'] },
  'IN-BR': { region: 'Middle Gangetic Plain', soil: S.alluvial, crops: ['Rice', 'Wheat', 'Maize', 'Sugarcane'] },
  'IN-CH': { region: 'Indo-Gangetic Plain', soil: S.alluvial, crops: ['Wheat', 'Rice', 'Vegetables'] },
  'IN-CT': { region: 'Eastern Plateau', soil: S.red, crops: ['Rice', 'Maize', 'Pigeon pea'] },
  'IN-DH': { region: 'West Coast', soil: S.laterite, crops: ['Rice', 'Sugarcane', 'Mango'] },
  'IN-DL': { region: 'Indo-Gangetic Plain', soil: S.alluvial, crops: ['Wheat', 'Mustard', 'Vegetables'] },
  'IN-GA': { region: 'West Coast / Konkan', soil: S.laterite, crops: ['Rice', 'Coconut', 'Cashew'] },
  'IN-GJ': { region: 'Gujarat Plains & Hills', soil: S.black, crops: ['Groundnut', 'Cotton', 'Wheat', 'Cumin'] },
  'IN-HP': { region: 'Western Himalaya', soil: S.mountain, crops: ['Apple', 'Wheat', 'Maize', 'Tea'] },
  'IN-HR': { region: 'Trans-Gangetic Plain', soil: S.alluvial, crops: ['Wheat', 'Rice', 'Mustard', 'Cotton'] },
  'IN-JH': { region: 'Eastern Plateau', soil: S.red, crops: ['Rice', 'Maize', 'Pulses'] },
  'IN-JK': { region: 'Western Himalaya', soil: S.mountain, crops: ['Apple', 'Saffron', 'Wheat', 'Rice'] },
  'IN-KA': { region: 'Southern Plateau & Ghats', soil: S.red, crops: ['Ragi', 'Coffee', 'Sugarcane', 'Rice'] },
  'IN-KL': { region: 'West Coast Plains & Ghats', soil: S.laterite, crops: ['Coconut', 'Rubber', 'Pepper', 'Rice', 'Banana'] },
  'IN-LA': { region: 'Cold desert / Trans-Himalaya', soil: S.mountain, crops: ['Barley', 'Apricot', 'Vegetables'] },
  'IN-LD': { region: 'Island territories', soil: S.laterite, crops: ['Coconut', 'Tuna fisheries'] },
  'IN-MH': { region: 'Western Plateau & Hills', soil: S.black, crops: ['Sugarcane', 'Cotton', 'Soybean', 'Grapes', 'Onion'] },
  'IN-ML': { region: 'North-Eastern Hills', soil: S.mountain, crops: ['Rice', 'Potato', 'Turmeric'] },
  'IN-MN': { region: 'North-Eastern Hills', soil: S.mountain, crops: ['Rice', 'Maize', 'Pineapple'] },
  'IN-MP': { region: 'Central Plateau', soil: S.black, crops: ['Soybean', 'Wheat', 'Chickpea', 'Cotton'] },
  'IN-MZ': { region: 'North-Eastern Hills', soil: S.mountain, crops: ['Rice', 'Maize', 'Ginger'] },
  'IN-NL': { region: 'North-Eastern Hills', soil: S.mountain, crops: ['Rice', 'Maize', 'Soybean'] },
  'IN-OR': { region: 'East Coast & Eastern Ghats', soil: S.red, crops: ['Rice', 'Turmeric', 'Groundnut', 'Sugarcane'] },
  'IN-PB': { region: 'Trans-Gangetic Plain', soil: S.alluvial, crops: ['Wheat', 'Rice', 'Maize', 'Cotton'] },
  'IN-PY': { region: 'East Coast Plain', soil: S.alluvial, crops: ['Rice', 'Coconut', 'Groundnut'] },
  'IN-RJ': { region: 'Western Dry Region', soil: S.arid, crops: ['Mustard', 'Bajra', 'Wheat', 'Pulses'] },
  'IN-SK': { region: 'Eastern Himalaya', soil: S.mountain, crops: ['Cardamom', 'Maize', 'Rice'] },
  'IN-TG': { region: 'Southern Plateau', soil: S.black, crops: ['Rice', 'Cotton', 'Chilli', 'Redgram'] },
  'IN-TN': { region: 'East Coast Plain & Hills', soil: S.red, crops: ['Rice', 'Groundnut', 'Sugarcane', 'Banana'] },
  'IN-TR': { region: 'North-Eastern Hills', soil: S.red, crops: ['Rice', 'Rubber', 'Pineapple'] },
  'IN-UP': { region: 'Upper / Middle Gangetic Plain', soil: S.alluvial, crops: ['Wheat', 'Rice', 'Sugarcane', 'Potato', 'Mustard'] },
  'IN-UT': { region: 'Western Himalaya', soil: S.mountain, crops: ['Rice', 'Wheat', 'Apple', 'Tea'] },
  'IN-WB': { region: 'Lower Gangetic Plain', soil: S.alluvial, crops: ['Rice', 'Jute', 'Potato', 'Mustard', 'Tea'] },
};

export const GIS_SOURCES = {
  boundaries: 'geoBoundaries (William & Mary geoLab) — India ADM1/ADM2 from DataMeet / Election Commission of India. CC BY 2.5 IN.',
  satellite: 'Esri World Imagery. Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community.',
  terrain: 'OpenTopoMap (CC BY-SA) based on OpenStreetMap and SRTM.',
  streets: '© OpenStreetMap contributors.',
  soil: 'Dominant soil group at state / UT level, compiled from ICAR–NBSS&LUP major soil regions of India. Not a farm-level polygon map. High-resolution NBSS sheets are not bundled.',
  crops: 'Indicative crops from ICAR agro-climatic grouping. Not the crop ML model and not a yield forecast.',
};

export function agriForIso(iso) {
  return STATE_AGRI[iso] || null;
}

export function soilFill(iso, soilOn, cropOn) {
  const row = agriForIso(iso);
  if (!row) return { color: '#8a9184', fill: '#8a9184', opacity: 0.15 };
  if (cropOn && !soilOn) {
    return { color: '#f6f1e7', fill: row.soil.color, opacity: 0.28 };
  }
  if (soilOn) {
    return { color: '#f6f1e7', fill: row.soil.color, opacity: 0.55 };
  }
  return { color: '#f6f1e7', fill: '#2c5a3c', opacity: 0.08 };
}
