import {
  agriForPlace,
  findCropName,
  findDistrict,
  findNodeNumber,
  findPlace,
  findRangeKey,
  findSensorKey,
  findSoilGroup,
  fold,
  refersToPrior,
} from './places';

const ROUTES = {
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

const SHOW = /show|open|search|focus|zoom|dikhao|dikha|दाखव|दिखाओ|दिखा|उघड|खोल|খোল|দেখাও|দেখুৱাও|બતાવો|ખોલો|ਵਿਖਾਓ|ਖੋਲ੍ਹੋ|காட்டு|திற|చూపించు|తెరువు|ತೋರಿಸು|ತೆರೆ|കാണിക്കൂ|തുറക്കൂ|ଦେଖାଅ|ଖୋଲ|دکھاؤ|کھولو/i;
const INFO = /\btell\b|\babout\b|\binformation\b|\binfo\b|\bstatus\b|\bhealthy\b|\bhealth\b|\bwrong\b|\bdetails\b|\bexplain\b|\bsummary\b|\bsummarise\b|\bsummarize\b|\bwhat\b|\bwhich\b|\blatest\b|बताओ|बताइए|जानकारी|स्थिति|स्वस्थ|माहिती|सांगा|বিস্তার|তথ্য|সম্পর্কে|বলুন|বলো|જણાવો|ਦੱਸੋ|சொல்|விவரம்|వివరించు|గురించి|చెప్పు|ತಿಳಿಸು|പറയൂ|କୁହ|ক'ব|بتاؤ|تفصیل|کیفیت/i;
const HEALTH = /\bhealthy\b|\bhealth\b|\bwrong\b|\balert\b|\bcritical\b|\bissue\b|स्वस्थ|गंभीर|समस्या|तब्येत|খারাপ|સ્વસ્થ|ਸਿਹਤ|ஆரோக்கிய|ఆరోగ్యం|ಆರೋಗ್ಯ|ആരോഗ്യം|ସ୍ୱାସ୍ଥ୍ୟ|স্বাস্থ্য|صحت/i;
const GIS_WORD = /\bgis\b|gi s|satellite agric|agricultural map|india agricultural|geo map|जीआईएस|জিআইএস|જીઆઈએસ|ਜੀਆਈਐਸ|ஜிஐஎஸ்|జిఐఎస్|ಜಿಐಎಸ್|ജിഐഎസ്|ଜିଆଇଏସ|جی آئی ایس/;
const MARKET_WORD = /price|prices|mandi|market|भाव|मंडी|बाजार|दर|rate|দাম|ભાવ|ਭਾਅ|விலை|ధర|ಬೆಲೆ|വില|ଦର|قیمت/;
const HISTORY_WORD = /history|इतिहास|telemetry graph|past reading|previous reading|ইতিহাস|ઇતિહાસ|ਇਤਿਹਾਸ|வரலாறு|చరిత్ర|ಇತಿಹಾಸ|ചരിത്രം|ଇତିହାସ|تاریخ/;
const ANALYZE_WORD = /analyze|analyse|analysis|विश्लेषण|तपासणी|বিশ্লেষণ|વિશ્લેષણ|ਵਿਸ਼ਲੇਸ਼ਣ|பகுப்பாய்வு|విశ్లేషణ|ವಿಶ್ಲೇಷಣೆ|വിശകലനം|ବିଶ୍ଳେଷଣ|تجزیہ/;
const SOIL_WORD = /soil type|type of soil|soil of|soil|माती|मिट्टी|মাটি|માટી|ਮਿੱਟੀ|மண்|మట్టి|ಮಣ್ಣು|മണ്ണ്|ମାଟି|مٹی/;
const CROP_WORD = /crop suit|suitable crop|crops? suitable|suitable .*crops?|crops for|what crops|which crops|पिके|फसल|পিক|ফসল|પાક|ਫਸਲ|பயிர்|పంట|ಬೆಳೆ|വിള|ଫସଲ|فصل/;
const DASH_WORD = /open dashboard|go to dashboard|home page|डैशबोर्ड|ড্যাশবোর্ড|ડેશબોર્ડ|ਡੈਸ਼ਬੋਰਡ|டாஷ்போர்டு|డాష్‌బోర్డ్|ಡ್ಯಾಶ್‌ಬೋರ್ಡ್|ഡാഷ്‌ബോർഡ്|ଡ୍ୟାସବୋର୍ଡ|ڈیش بورڈ/;
const PROFILE_WORD = /open profile|my profile|खाते|প্রোফাইল|પ્રોફાઇલ|ਪ੍ਰੋਫ਼ਾਈਲ|சுயவிவரம்|ప్రొఫైల్|ಪ್ರೊಫೈಲ್|പ്രൊഫൈൽ|ପ୍ରୋଫାଇଲ|پروفائل/;
const RESULTS_WORD = /open results|go to results|परिणाम|निकाल|ফলাফল|પરિણામ|ਨਤੀਜੇ|முடிவுகள்|ఫలితాలు|ಫಲಿತಾಂಶ|ഫലം|ଫଳାଫଳ|نتائج/i;
const NODE_WORD = /show node|open node|select node|नोड|নোড|નોડ|ਨੋਡ|நோட்|నోడ్|ನೋಡ್|നോഡ്|ନୋଡ|نوڈ/;
const YESTERDAY = /\byesterday\b|कल|काल|গতকাল|ગઈકાલે|ਕੱਲ੍ਹ|நேற்று|నిన్న|ನಿನ್ನೆ|ഇന്നലെ|ଗତକାଲି|কাল|کل/i;
const IRRIGATION = /irrigat|सिंचाई|सिंचन|সেচ|સિંચાઈ|ਸਿੰਚਾਈ|பாசன|నీటిపారుదల|ನೀರಾವರಿ|ജലസേചനം|ଜଳସେଚନ|সেচ|آبپاشی/i;
const PEST = /pest|कीट|कीड|পোকা|જીવાત|ਕੀੜੇ|பூச்சி|పురుగు|ಕೀಟ|കീട|କୀଟ|কীট|کیڑا/i;
const FERT = /fertilizer|खाद|खत|সার|ખાતર|ਖਾਦ|உரம்|ఎరువు|ಗೊಬ್ಬರ|വളം|ସାର|সার|کھاد/i;
const CALENDAR = /crop calendar|calendar|कैलेंडर|कॅलेंडर|ক্যালেন্ডার/i;
const WATER_FT = /water footprint|जल पदचिह्न|पाणी/i;
const SUSTAIN = /sustainab|सतत|टिकाऊ|টেকসই/i;
const SCHEMES = /scheme|yojana|योजना|প্রকল্প|યોજના|ਸਕੀਮ|திட்டம்|పథకం|ಯೋಜನೆ|പദ്ധതി|ଯୋଜନା|স্কীম|اسکیم/i;
const EXPORT = /export report|download report|निर्यात|निर्यात/i;

function has(text, re) {
  return re.test(text);
}

function onGis(ctx) {
  return String(ctx?.currentRoute || '').includes('/app/gis');
}

function onMap(ctx) {
  const path = String(ctx?.currentRoute || '');
  return path.includes('/app/iot') || path.endsWith('/app/map');
}

function wantsInfo(raw, text) {
  return has(raw, INFO) || has(text, INFO) || has(raw, HEALTH) || has(text, HEALTH);
}

function resolveFromContext(ctx, { node, place, crop, district, range, topic }) {
  const prior = ctx || {};
  const focus = prior.lastFocusType;
  let nextNode = node;
  let nextPlace = place;
  let nextCrop = crop;
  let nextDistrict = district;
  let nextRange = range;
  const preferGis = focus === 'gis' || topic === 'gis';
  const preferMarket = focus === 'market' || topic === 'market';
  if (nextNode == null && !preferGis && !preferMarket) {
    nextNode = Number(prior.lastNodeNumber || prior.selectedNode?.nodeNumber) || null;
  }
  if (!nextPlace && (preferGis || focus === 'gis' || prior.lastPlace)) nextPlace = prior.lastPlace || null;
  if (!nextCrop && (preferMarket || focus === 'market' || topic === 'market')) {
    nextCrop = prior.lastCrop || prior.selectedCrop || prior.primaryCrop || null;
  }
  if (!nextDistrict && preferMarket) nextDistrict = prior.lastDistrict || null;
  if (!nextDistrict && prior.lastDistrict) nextDistrict = prior.lastDistrict;
  if (!nextRange && useRange(prior)) nextRange = prior.lastRange || null;
  return { node: nextNode, place: nextPlace, crop: nextCrop, district: nextDistrict, range: nextRange };
}

function useRange(prior) {
  return Boolean(prior?.lastRange);
}

/**
 * Deterministic website-action planner.
 * GIS / navigation / filters are decided here so Gemini never answers a GIS
 * request with Analyze-page NPK.
 *
 * mode:
 *  action — navigate/select only
 *  info   — navigate/select + retrieve application data + summarize
 *  data   — existing snapshot replies (farm status)
 *  conversation — Gemini fallback
 */
export function planIntent(message, ctx = {}) {
  const raw = String(message || '').trim();
  const text = fold(raw);
  if (!raw) return { mode: 'conversation', intent: 'CONVERSATION', actions: [] };

  let place = findPlace(raw);
  let node = findNodeNumber(raw);
  let crop = findCropName(raw);
  let range = findRangeKey(raw);
  const soilGroup = findSoilGroup(raw);
  let district = findDistrict(raw);
  const sensorKey = findSensorKey(raw);
  const prior = refersToPrior(raw);
  const info = wantsInfo(raw, text);
  const here = has(text, /\bhere\b|यहाँ|इथे|इधर/);

  if (prior && (!node || !place || !crop || !district || !range)) {
    const topic = (YESTERDAY.test(raw) || has(raw, MARKET_WORD) || has(text, MARKET_WORD))
      ? 'market'
      : (has(raw, GIS_WORD) || has(text, GIS_WORD) || has(raw, SOIL_WORD) || has(text, SOIL_WORD) || has(raw, CROP_WORD) || has(text, CROP_WORD))
        ? 'gis'
        : (sensorKey || has(raw, HEALTH) || has(text, HEALTH) || has(raw, NODE_WORD))
          ? 'node'
          : (ctx.lastFocusType || null);
    const filled = resolveFromContext(ctx, { node, place, crop, district, range, topic });
    if (node == null) node = filled.node;
    if (!place) place = filled.place;
    if (!crop) crop = filled.crop;
    if (!district) district = filled.district;
    if (!range) range = filled.range;
  }

  const mentionsGis = has(text, GIS_WORD) || has(raw, GIS_WORD);
  const farmMap = has(text, /farm map|hardware map|iot map|sensor map|node map|my map/)
    || (has(text, /\bmap\b|नकाशा|মানচিত্র|નકશો|ਨਕਸ਼ਾ|வரைபடம்|మ్యాప్|ನಕ್ಷೆ|ഭൂപടം|ମାନଚିତ୍ର|نقشہ/) && !mentionsGis && !place && !soilGroup);
  const mentionsMarket = has(text, MARKET_WORD) || has(raw, MARKET_WORD) || (prior && (ctx.lastIntent || '').includes('MARKET') && (YESTERDAY.test(raw) || info));
  const mentionsHistory = has(text, HISTORY_WORD) || has(raw, HISTORY_WORD);
  const mentionsAnalyze = (has(text, ANALYZE_WORD) || has(raw, ANALYZE_WORD)) && !mentionsGis;
  const mentionsResults = has(text, /crop ai|what crop did|recommended crop|crop recommendation|ai recommend/)
    || has(raw, RESULTS_WORD);
  const mentionsWeather = has(text, /rain|weather|मौसम|हवामान|बारिश|আবহাওয়া|હવામાન|ਮੌਸਮ|வானிலை|వాతావరణం|ಹವಾಮಾನ|കാലാവസ്ഥ|ପାଣିପାଗ|موسم/) && !mentionsGis && !place;
  const farmStatus = has(text, /how is my farm|farm doing|farm status|मेरा खेत|माझे शेत|मेरे खेत/);
  const hello = has(text, /^(hello|hi|hey|namaste|namaskar|नमस्ते|नमस्कार|হ্যালো|નમસ્તે|ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ|வணக்கம்|నమస్కారం|ನಮಸ್ಕಾರ|നമസ്കാരം|ନମସ୍କାର|السلام علیکم)$/);
  const soilTypeOfPlace = Boolean(place || district) && (has(text, SOIL_WORD) || has(raw, SOIL_WORD));
  const cropSuitOfPlace = Boolean(place || district) && (has(text, CROP_WORD) || has(raw, CROP_WORD));
  const showPlace = Boolean(place) && has(raw, SHOW)
    && !mentionsMarket && node == null;
  const blackRegions = Boolean(soilGroup) && has(raw, SHOW) && !node;
  const openGis = has(text, /open gis|go to gis|take me to gis|gis page|gis map|gis section/) || (has(raw, GIS_WORD) && has(raw, SHOW));
  const dashboard = has(text, DASH_WORD) || has(raw, DASH_WORD);
  const profile = has(text, PROFILE_WORD) || has(raw, PROFILE_WORD);
  const beta = has(text, /open beta|hardware beta/) || has(raw, /बीटा|बीटा|বেটা|બીટા|ਬੀਟਾ|பீட்டா|బీటా|ಬೀಟಾ|ബീറ്റ|ବିଟା|بیٹا/);
  const openSat = (has(text, /open satellite|satellite page|satellite view|satellite gis/)
    || (has(raw, /सैटेलाइट|सॅटेलाइट|স্যাটেলাইট|સેટેલાઇટ|ਸੈਟੇਲਾਈਟ|செயற்கைக்கோள்|ఉపగ్రహం|ಉಪಗ್ರಹ|സാറ്റലൈറ്റ്|ଉପଗ୍ରହ|উপগ্ৰহ|سیٹلائٹ/) && has(raw, SHOW)))
    && !soilTypeOfPlace && !cropSuitOfPlace && !mentionsGis;
  const thisNode = node == null && has(text, /this node|current node|selected node|इस नोड/)
    ? Number(ctx?.selectedNode?.nodeNumber || ctx?.lastNodeNumber) || null
    : node;
  const gisHere = here && onGis(ctx) && (has(text, /soil|crop|माती|पिक/) || !place);
  const growAsk = has(text, /what (crop )?should i grow|which crop should|what crop should|क्या उगा|কী চাষ|શું ઉગાડું|ਕਿਹੜੀ ਫਸਲ|எந்த பயிர்|ఏ పంట|ಯಾವ ಬೆಳೆ|ഏത് വിള|କେଉଁ ଫସଲ|কোন শস্য|کون سی فصل/);
  const explainAnalysis = has(text, /explain|what did|recommended crop|crop model|क्यों|का सुझाव/)
    && (mentionsAnalyze || mentionsResults || growAsk);

  if (hello) {
    return { mode: 'conversation', intent: 'CONVERSATION', actions: [], message: raw };
  }

  if (mentionsMarket || (crop && has(text, /price|mandi|market|भाव|मंडी|बाजार/))) {
    if (!crop && (prior || YESTERDAY.test(raw) || info)) {
      crop = ctx.lastCrop || ctx.selectedCrop || ctx.primaryCrop || null;
    }
    const actions = [];
    if (crop) {
      actions.push({
        type: 'showMarketPrice',
        commodity: crop,
        state: place?.name || ctx.selectedMarketState || ctx.lastMarketState || '',
        district: district?.name || ctx.selectedMarketDistrict || ctx.lastMarketDistrict || '',
      });
      if (has(text, /trend|graph|history|7 day|week/) || range) {
        actions.push({
          type: 'showMarketTrend',
          commodity: crop,
          state: place?.name || '',
          range: range || '7d',
        });
      }
    } else {
      actions.push({ type: 'openMarket' });
      if (place) actions.push({ type: 'filterMarketState', state: place.name });
    }
    const asInfo = Boolean(info && crop);
    return {
      mode: asInfo ? 'info' : 'action',
      intent: asInfo ? 'MARKET_INFO' : (crop ? 'MARKET_QUERY' : 'NAVIGATE_MARKET'),
      actions,
      place,
      district,
      crop,
      yesterday: YESTERDAY.test(raw),
      message: raw,
    };
  }

  if ((mentionsGis || openGis || showPlace || blackRegions || gisHere || ((soilTypeOfPlace || cropSuitOfPlace) && node == null)) && !growAsk) {
    const wantSoil = soilTypeOfPlace || has(text, /soil|माती|मिट्टी|মাটি|માટી|ਮਿੱਟੀ|மண்|నేల|ಮಣ್ಣು|മണ്ണ്|ମାଟି|مٹی/) || Boolean(soilGroup);
    const wantCrops = cropSuitOfPlace || (has(text, /crop suit|suitable crop|pika|पिक|শস্য|પાક|ਫਸਲ|பயிர்|పంట|ಬೆಳೆ|വിള|ଫସଲ|فصل/) && !mentionsResults);
    const target = place || (gisHere ? findPlace(ctx.selectedGISRegion?.name || ctx.lastPlace?.name || '') : null);
    const actions = [{ type: 'openGIS' }];
    if (wantSoil) actions.push({ type: 'activateGISLayer', layer: 'soil', on: true });
    if (wantCrops) actions.push({ type: 'activateGISLayer', layer: 'crops', on: true });
    if (target) {
      actions.push({ type: 'selectGISState', name: target.name, iso: target.iso, soil: wantSoil || !wantCrops, crops: wantCrops });
      actions.push({ type: 'zoomToGISRegion', name: target.name, iso: target.iso });
    } else if (district?.state) {
      const parent = findPlace(district.state);
      if (parent) {
        actions.push({ type: 'selectGISState', name: parent.name, iso: parent.iso, soil: wantSoil, crops: wantCrops });
      }
      actions.push({ type: 'selectGISDistrict', name: district.name });
    } else if (soilGroup) {
      actions.push({ type: 'activateGISLayer', layer: 'soil', on: true });
    }
    const infoIntent = wantCrops ? 'GIS_CROP_INFO' : 'GIS_SOIL_INFO';
    const actionIntent = target && wantCrops ? 'GIS_CROP_SEARCH' : target ? 'GIS_SOIL_SEARCH' : soilGroup ? 'GIS_SOIL_FILTER' : 'NAVIGATE_GIS';
    const gisAsk = (soilTypeOfPlace || cropSuitOfPlace) && !has(raw, SHOW);
    const asInfo = Boolean((info || gisAsk) && (target || district));
    return {
      mode: asInfo ? 'info' : 'action',
      intent: asInfo ? infoIntent : actionIntent,
      actions,
      place: target,
      district,
      soilGroup,
      agri: agriForPlace(target) || agriForPlace(findPlace(district?.state || '')),
      message: raw,
    };
  }

  if ((mentionsAnalyze || growAsk || explainAnalysis) && (thisNode || node || (explainAnalysis && ctx.lastNodeNumber))) {
    const num = thisNode || node || Number(ctx.lastNodeNumber) || null;
    if (explainAnalysis && !has(text, /analyze node|analyse node|run analysis/)) {
      return {
        mode: 'info',
        intent: 'ANALYSIS_INFO',
        actions: [{ type: 'showLatestAnalysis' }, { type: 'openResults' }],
        nodeNumber: num,
        message: raw,
      };
    }
    return {
      mode: 'info',
      intent: 'RUN_ANALYSIS',
      actions: [
        { type: 'openAnalyze' },
        { type: 'selectAnalysisNode', nodeNumber: num },
        { type: 'runAnalysis', nodeNumber: num },
      ],
      nodeNumber: num,
      message: raw,
    };
  }

  if (mentionsHistory || (range && node)) {
    const num = thisNode || node;
    const actions = [{ type: 'openHistory' }];
    if (num) actions.push({ type: 'selectHistoryNode', nodeNumber: num });
    if (range) {
      actions.push({ type: 'selectHistoryRange', range });
      actions.push({ type: 'showHistoryGraph', range, nodeNumber: num });
    }
    return {
      mode: num ? 'info' : 'action',
      intent: num ? 'NODE_HISTORY' : 'HISTORY',
      actions,
      nodeNumber: num,
      range: range || '1d',
      message: raw,
    };
  }

  if (farmMap || (node && !mentionsAnalyze && !mentionsHistory) || has(raw, NODE_WORD) || (sensorKey && (thisNode || node || prior))) {
    const num = thisNode || node;
    const actions = [{ type: 'openMap' }];
    if (num) {
      actions.push({ type: 'selectNode', nodeNumber: num });
      actions.push({ type: 'showNodeDetails', nodeNumber: num });
    }
    const infoNode = Boolean(num) && (info || sensorKey || has(raw, HEALTH));
    return {
      mode: infoNode ? 'info' : 'action',
      intent: infoNode ? 'NODE_INFO' : (num ? 'NODE_SELECT' : 'NAVIGATE_MAP'),
      actions,
      nodeNumber: num,
      sensorKey: sensorKey || null,
      message: raw,
    };
  }

  if (mentionsAnalyze) {
    return { mode: 'action', intent: 'NAVIGATE_ANALYZE', actions: [{ type: 'openAnalyze' }], message: raw };
  }
  if (has(raw, RESULTS_WORD) && !has(text, /crop ai|what should i grow|which crop|recommended crop|crop recommendation/)) {
    return { mode: 'action', intent: 'NAVIGATE_RESULTS', actions: [{ type: 'openResults' }], message: raw };
  }
  if ((mentionsResults || has(text, /what should i grow|which crop should|क्या उगा|কী চাষ|શું ઉગાડું|ਕਿਹੜੀ ਫਸਲ|எந்த பயிர்|ఏ పంట|ಯಾವ ಬೆಳೆ|ഏത് വിള|କେଉଁ ଫସଲ|কোন শস্য|کون سی فصل/)) && !place) {
    return {
      mode: 'info',
      intent: 'ANALYSIS_INFO',
      actions: [{ type: 'showLatestAnalysis' }, { type: 'openResults' }],
      message: raw,
    };
  }
  if (dashboard) {
    return { mode: 'action', intent: 'NAVIGATE_DASHBOARD', actions: [{ type: 'openDashboard' }], message: raw };
  }
  if (has(raw, RESULTS_WORD) && !place) {
    return { mode: 'action', intent: 'NAVIGATE_RESULTS', actions: [{ type: 'openResults' }], message: raw };
  }
  if (profile) {
    return { mode: 'action', intent: 'NAVIGATE_PROFILE', actions: [{ type: 'openProfile' }], message: raw };
  }
  if (beta) {
    return { mode: 'action', intent: 'NAVIGATE_BETA', actions: [{ type: 'openBeta' }], message: raw };
  }
  if (openSat) {
    return { mode: 'action', intent: 'NAVIGATE_SATELLITE', actions: [{ type: 'openSatellite' }], message: raw };
  }
  if (has(raw, IRRIGATION) || has(text, IRRIGATION)) {
    const irrInfo = info || !has(raw, SHOW);
    return {
      mode: irrInfo ? 'info' : 'action',
      intent: irrInfo ? 'IRRIGATION_INFO' : 'NAVIGATE_IRRIGATION',
      actions: [{ type: 'openIrrigation' }],
      message: raw,
    };
  }
  if (has(raw, PEST)) {
    return { mode: 'info', intent: 'PEST_INFO', actions: [{ type: 'openPest' }], message: raw };
  }
  if (has(raw, FERT)) {
    return { mode: 'info', intent: 'FERTILIZER_INFO', actions: [{ type: 'openFertilizer' }], message: raw };
  }
  if (has(raw, CALENDAR)) {
    return { mode: 'info', intent: 'CALENDAR_INFO', actions: [{ type: 'openCalendar' }], message: raw };
  }
  if (has(text, WATER_FT)) {
    return { mode: 'info', intent: 'WATER_INFO', actions: [{ type: 'openWater' }], message: raw };
  }
  if (has(raw, SUSTAIN)) {
    return { mode: 'info', intent: 'SUSTAIN_INFO', actions: [{ type: 'openSustainability' }], message: raw };
  }
  if (has(raw, SCHEMES)) {
    return { mode: 'info', intent: 'SCHEMES_INFO', actions: [{ type: 'openSchemes' }], message: raw };
  }
  if (has(raw, EXPORT)) {
    return { mode: 'info', intent: 'EXPORT_INFO', actions: [{ type: 'openExport' }], message: raw };
  }
  if (farmStatus) {
    return { mode: 'data', intent: 'FARM_STATUS', actions: [{ type: 'getLatestFarmStatus' }], message: raw };
  }
  if (has(text, /anomal|critical|issue|alert|गंभीर|গুরুতর|ગંભીર|ਗੰਭੀਰ|கடுமை|తీవ్ర|ಗಂಭೀರ|ഗുരുതര|ଗମ୍ଭୀର|গুৰুতৰ|سنگین/) && !mentionsGis) {
    return { mode: 'data', intent: 'NODE_ANOMALY_QUERY', actions: [{ type: 'getLatestAnomalies' }, { type: 'openMap' }], message: raw };
  }
  if (mentionsWeather) {
    const wxInfo = info || !has(raw, SHOW);
    return {
      mode: wxInfo ? 'info' : 'action',
      intent: wxInfo ? 'WEATHER_INFO' : 'NAVIGATE_WEATHER',
      actions: [{ type: 'openWeather' }],
      message: raw,
    };
  }
  if (has(text, /my soil|soil n|nitrogen|npk|sensor/) && !place && !mentionsGis) {
    return { mode: 'data', intent: 'FARM_STATUS', actions: [{ type: 'getLatestNodeTelemetry' }], message: raw };
  }

  return { mode: 'conversation', intent: 'CONVERSATION', actions: [], message: raw, place, node };
}

export { ROUTES };
