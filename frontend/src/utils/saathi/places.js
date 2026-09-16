import { STATE_AGRI, SOIL_GROUPS, agriForIso } from '../../data/indiaAgriculture';
import { DISTRICTS } from '../../data/indiaLocations';

export function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const GIS_STATES = [
  { iso: 'IN-AN', name: 'Andaman and Nicobar Islands', aliases: ['andaman', 'nicobar'] },
  { iso: 'IN-AP', name: 'Andhra Pradesh', aliases: ['andhra pradesh', 'andhra', 'आंध्र'] },
  { iso: 'IN-AR', name: 'Arunachal Pradesh', aliases: ['arunachal'] },
  { iso: 'IN-AS', name: 'Assam', aliases: ['assam', 'असम', 'আসাম', 'આસામ', 'ਅਸਾਮ', 'அசாம்', 'అస్సాం', 'ಅಸ್ಸಾಂ', 'അസം', 'ଆସାମ', 'অসম', 'آسام'] },
  { iso: 'IN-GJ', name: 'Gujarat', aliases: ['gujarat', 'गुजरात', 'গুজরাট', 'ગુજરાત', 'ਗੁਜਰਾਤ', 'குஜராத்', 'గుజరాత్', 'ಗುಜರಾತ್', 'ഗുജറാത്ത്', 'ଗୁଜୁରାଟ', 'گجرات'] },
  { iso: 'IN-KA', name: 'Karnataka', aliases: ['karnataka', 'कर्नाटक', 'কর্ণাটক', 'કર્ણાટક', 'ਕਰਨਾਟਕ', 'கர்நாடகா', 'కర్ణాటక', 'ಕರ್ನಾಟಕ', 'കർണാടക', 'କର୍ଣ୍ଣାଟକ', 'کرناٹک'] },
  { iso: 'IN-MH', name: 'Maharashtra', aliases: ['maharashtra', 'महाराष्ट्र', 'महाराष्ट्रातील', 'mh', 'মহারাষ্ট্র', 'મહારાષ્ટ્ર', 'ਮਹਾਰਾਸ਼ਟਰ', 'மகாராஷ்டிரா', 'మహారాష్ట్ర', 'ಮಹಾರಾಷ್ಟ್ರ', 'മഹാരാഷ്ട്ര', 'ମହାରାଷ୍ଟ୍ର', 'مہاراشٹر'] },
  { iso: 'IN-MP', name: 'Madhya Pradesh', aliases: ['madhya pradesh', 'मध्य प्रदेश', 'मध्यप्रदेश', 'mp', 'মধ্যপ্রদেশ', 'મધ્ય પ્રદેશ', 'ਮੱਧ ਪ੍ਰਦੇਸ਼', 'மத்தியப் பிரதேசம்', 'మధ్యప్రదేశ్', 'ಮಧ್ಯ ಪ್ರದೇಶ', 'മധ്യപ്രദേശ്', 'ମଧ୍ୟପ୍ରଦେଶ', 'مدھیہ پردیش'] },
  { iso: 'IN-OR', name: 'Odisha', aliases: ['odisha', 'orissa', 'ओडिशा', 'ওড়িশা', 'ઓડિશા', 'ਓਡੀਸ਼ਾ', 'ஒடிசா', 'ఒడిశా', 'ಒಡಿಶಾ', 'ഒഡീഷ', 'ଓଡ଼ିଶା', 'اوڈیشا'] },
  { iso: 'IN-PB', name: 'Punjab', aliases: ['punjab', 'पंजाब', 'পাঞ্জাব', 'પંજાબ', 'ਪੰਜਾਬ', 'பஞ்சாப்', 'పంజాబ్', 'ಪಂಜಾಬ್', 'പഞ്ചാബ്', 'ପଞ୍ଜାବ', 'پنجاب'] },
  { iso: 'IN-TN', name: 'Tamil Nadu', aliases: ['tamil nadu', 'tamilnadu', 'तमिलनाडु', 'তামিলনাড়ু', 'તમિલનાડુ', 'ਤਮਿਲਨਾਡੂ', 'தமிழ்நாடு', 'తమిళనాడు', 'ತಮಿಳುನಾಡು', 'തമിഴ്നാട്', 'ତାମିଲନାଡୁ', 'تمل ناڈو'] },
  { iso: 'IN-BR', name: 'Bihar', aliases: ['bihar', 'बिहार'] },
  { iso: 'IN-CH', name: 'Chandigarh', aliases: ['chandigarh'] },
  { iso: 'IN-CT', name: 'Chhattisgarh', aliases: ['chhattisgarh', 'chhatisgarh', 'छत्तीसगढ़'] },
  { iso: 'IN-DH', name: 'Dadra and Nagar Haveli and Daman and Diu', aliases: ['daman', 'diu', 'dadra'] },
  { iso: 'IN-DL', name: 'Delhi', aliases: ['delhi', 'nct', 'दिल्ली'] },
  { iso: 'IN-GA', name: 'Goa', aliases: ['goa', 'गोवा'] },
  { iso: 'IN-HP', name: 'Himachal Pradesh', aliases: ['himachal'] },
  { iso: 'IN-HR', name: 'Haryana', aliases: ['haryana', 'हरियाणा'] },
  { iso: 'IN-JH', name: 'Jharkhand', aliases: ['jharkhand'] },
  { iso: 'IN-JK', name: 'Jammu and Kashmir', aliases: ['jammu', 'kashmir'] },
  { iso: 'IN-KL', name: 'Kerala', aliases: ['kerala', 'केरल', 'কেরল', 'કેરળ', 'ਕੇਰਲ', 'கேரளா', 'కేరళ', 'ಕೇರಳ', 'കേരളം', 'କେରଳ', 'کیرالہ'] },
  { iso: 'IN-LA', name: 'Ladakh', aliases: ['ladakh'] },
  { iso: 'IN-LD', name: 'Lakshadweep', aliases: ['lakshadweep'] },
  { iso: 'IN-ML', name: 'Meghalaya', aliases: ['meghalaya'] },
  { iso: 'IN-MN', name: 'Manipur', aliases: ['manipur'] },
  { iso: 'IN-MZ', name: 'Mizoram', aliases: ['mizoram'] },
  { iso: 'IN-NL', name: 'Nagaland', aliases: ['nagaland'] },
  { iso: 'IN-PY', name: 'Puducherry', aliases: ['puducherry', 'pondicherry'] },
  { iso: 'IN-RJ', name: 'Rajasthan', aliases: ['rajasthan', 'राजस्थान'] },
  { iso: 'IN-SK', name: 'Sikkim', aliases: ['sikkim'] },
  { iso: 'IN-TG', name: 'Telangana', aliases: ['telangana', 'तेलंगाना'] },
  { iso: 'IN-TR', name: 'Tripura', aliases: ['tripura'] },
  { iso: 'IN-UP', name: 'Uttar Pradesh', aliases: ['uttar pradesh', 'उत्तर प्रदेश'] },
  { iso: 'IN-UT', name: 'Uttarakhand', aliases: ['uttarakhand', 'उत्तराखंड'] },
  { iso: 'IN-WB', name: 'West Bengal', aliases: ['west bengal', 'bengal', 'पश्चिम बंगाल'] },
].map((row) => ({
  ...row,
  aliases: [...new Set([row.name, ...(row.aliases || [])])],
}));

const SOIL_ALIASES = [
  { id: 'alluvial', aliases: ['alluvial', 'जलोढ़', 'পলি', 'કાંપ', 'ਜਲੋੜ', 'வண்டல்', 'ఒండ్రు', 'ಮೆಕ್ಕಲು', 'എക്കൽ', 'ପଟୁ', 'آبائی'] },
  { id: 'black', aliases: ['black', 'regur', 'black soil', 'काली', 'काळी', 'काळी माती', 'কালো', 'કાળી', 'ਕਾਲੀ', 'கரிசல்', 'నల్ల', 'ಕಪ್ಪು', 'കറുത്ത', 'କଳା', 'ক’লা', 'کالی'] },
  { id: 'red', aliases: ['red soil', 'लाल माती', 'red', 'লাল', 'લાલ', 'ਲਾਲ', 'சிவப்பு', 'ఎరుపు', 'ಕೆಂಪು', 'ചുവപ്പ്', 'ନାଲି', 'ৰঙা', 'سرخ'] },
  { id: 'laterite', aliases: ['laterite', 'लेटराइट', 'লেটেরাইট'] },
  { id: 'arid', aliases: ['arid', 'desert', 'शुष्क', 'रेगिस्तान', 'শুকনো', 'শুষ্ক'] },
  { id: 'mountain', aliases: ['mountain', 'forest soil', 'पहाड़ी', 'वन'] },
  { id: 'saline', aliases: ['saline', 'alkaline', 'लवणीय', 'ক্ষার'] },
  { id: 'peaty', aliases: ['peaty', 'marshy', 'दलदली'] },
];

const CROP_ALIASES = [
  { name: 'Wheat', aliases: ['wheat', 'गेहूं', 'गहू', 'गहूँ', 'গম', 'ઘઉં', 'ਕਣਕ', 'கோதுமை', 'గోధుమ', 'ಗೋಧಿ', 'ഗോതമ്പ്', 'ଗହମ', 'घेঁহু', 'گندم'] },
  { name: 'Rice', aliases: ['rice', 'paddy', 'धान', 'तांदूळ', 'ধান', 'ડાંગર', 'ਝੋਨਾ', 'நெல்', 'వరి', 'ಭತ್ತ', 'നെല്ല്', 'ଧାନ', 'چاول'] },
  { name: 'Cotton', aliases: ['cotton', 'कपास', 'कापूस', 'তুলা', 'કપાસ', 'ਕਪਾਹ', 'பருத்தி', 'పత్తి', 'ಹತ್ತಿ', 'പരുത്തി', 'କପା', 'کپاس'] },
  { name: 'Onion', aliases: ['onion', 'प्याज', 'कांदा'] },
  { name: 'Potato', aliases: ['potato', 'आलू', 'बटाटा'] },
  { name: 'Tomato', aliases: ['tomato', 'टमाटर', 'टोमॅटो'] },
  { name: 'Maize', aliases: ['maize', 'corn', 'मक्का'] },
  { name: 'Cotton', aliases: ['cotton', 'कपास', 'कापूस'] },
  { name: 'Soyabean', aliases: ['soyabean', 'soybean', 'सोयाबीन'] },
  { name: 'Rice', aliases: ['rice', 'paddy', 'धान', 'तांदूळ'] },
  { name: 'Sugarcane', aliases: ['sugarcane', 'गन्ना', 'ऊस'] },
];

function longestMatch(message, rows, aliasesKey = 'aliases') {
  const hay = fold(message);
  let best = null;
  for (const row of rows) {
    for (const alias of row[aliasesKey] || []) {
      const needle = fold(alias);
      if (!needle) continue;
      if (hay.includes(needle) && (!best || needle.length > best._len)) {
        best = { ...row, _len: needle.length, matched: alias };
      }
    }
  }
  if (!best) return null;
  delete best._len;
  return best;
}

export function findPlace(message) {
  return longestMatch(message, GIS_STATES);
}

export function findSoilGroup(message) {
  const row = longestMatch(message, SOIL_ALIASES);
  if (!row) return null;
  return SOIL_GROUPS[row.id] ? { id: row.id, ...SOIL_GROUPS[row.id] } : null;
}

export function findCropName(message) {
  const row = longestMatch(message, CROP_ALIASES);
  return row ? row.name : null;
}

export function findNodeNumber(message) {
  const match = String(message || '').match(/node\s*0*(\d+)/i)
    || String(message || '').match(/(?:नोड|নোড|નોડ|ਨੋਡ|நோட்|నోడ్|ನೋಡ್|നോഡ്|ନୋଡ|نوڈ)\s*0*(\d+)/);
  return match ? Number(match[1]) : null;
}

export function findRangeKey(message) {
  const raw = String(message || '');
  const text = fold(raw);
  if (/\b1y\b|one year|12 month|साल|वर्ष|বছর|વર્ષ|ਸਾਲ|ஆண்டு|సంవత్సర|ವರ್ಷ|വർഷം|ବର୍ଷ|বছৰ|سال/.test(text + raw)) return '1y';
  if (/\b1m\b|one month|30 day|महिना|महीना|মাস|મહિનો|ਮਹੀਨਾ|மாதம்|నెల|ತಿಂಗಳು|മാസം|ମାସ|মাহ|مہینہ/.test(text + raw)) return '1m';
  if (/\b1w\b|7 day|seven day|one week|last week|a week|सात दिन|एक आठवडा|आठवडा|সপ্তাহ|અઠવાડિયું|ਹਫ਼ਤਾ|வாரம்|వారం|ವಾರ|ആഴ്ച|ସପ୍ତାହ|সপ্তাহ|ہفتہ/.test(text + raw)) return '1w';
  if ((/\b1d\b|today|24h|one day|आज|আজ|આજે|ਅੱਜ|இன்று|ఈరోజు|ಇಂದು|ഇന്ന്|ଆଜି|আজি|آج/.test(text + raw)) && /history|graph|telemetry|readings|इतिहास|ইতিহাস|ઇતિહાસ|ਇਤਿਹਾਸ|வரலாறு|చరిత్ర|ಇತಿಹಾಸ|ചരിത്രം|ଇତିହାସ|تاریخ/.test(text + raw)) return '1d';
  if (/week|7 day|सात|সপ্তাহ|વાર|ਹਫ਼ਤਾ|வாரம்|వారం|ವಾರ|ആഴ്ച|ସପ୍ତାହ|ہفتہ/.test(text + raw)) return '1w';
  return null;
}

export function nameForIso(iso) {
  return GIS_STATES.find((row) => row.iso === iso)?.name || iso;
}

export function agriForPlace(place) {
  if (!place?.iso) return null;
  const agri = agriForIso(place.iso);
  if (!agri) return null;
  return {
    iso: place.iso,
    name: place.name,
    region: agri.region,
    soil: {
      id: agri.soil.id,
      label: agri.soil.label,
      texture: agri.soil.texture,
      fertility: agri.soil.fertility,
      phRange: agri.soil.phRange,
      organicCarbon: agri.soil.organicCarbon,
      note: agri.soil.note,
    },
    crops: agri.crops,
  };
}

export function statesForSoilGroup(groupId) {
  return Object.entries(STATE_AGRI)
    .filter(([, row]) => row.soil.id === groupId)
    .map(([iso, row]) => ({
      iso,
      name: nameForIso(iso),
      region: row.region,
      soil: row.soil.label,
      crops: row.crops,
    }));
}

export function matchGeoName(featureName, query) {
  const hay = fold(featureName);
  const needle = fold(query);
  if (!needle || !hay) return false;
  return hay.includes(needle) || needle.includes(hay);
}

const SENSOR_ALIASES = [
  { key: 'nitrogen', aliases: ['nitrogen', 'नाइट्रोजन', 'नायट्रोजन', 'নাইট্রোজেন', 'નાઇટ્રોજન', 'ਨਾਈਟ੍ਰੋਜਨ', 'நைட்ரஜன்', 'నైట్రోజన్', 'ನೈಟ್ರೋಜನ್', 'നൈട്രജൻ', 'ନାଇଟ୍ରୋଜେନ', 'نائٹروجن'] },
  { key: 'phosphorus', aliases: ['phosphorus', 'फॉस्फोरस', 'फॉस्फरस', 'ফসফরাস', 'ફોસ્ફરસ', 'ਫਾਸਫੋਰਸ', 'பாஸ்பரஸ்', 'భాస్వరం', 'ಫಾಸ್ಫರಸ್', 'ഫോസ്ഫറസ്', 'ଫସଫରସ', 'فاسفورس'] },
  { key: 'potassium', aliases: ['potassium', 'पोटैशियम', 'पोटॅशियम', 'পটাশিয়াম', 'પોટેશિયમ', 'ਪੋਟਾਸ਼ੀਅਮ', 'பொட்டாசியம்', 'పొటాషియం', 'ಪೊಟ್ಯಾಸಿಯಂ', 'പൊട്ടാസ്യം', 'ପଟାସିଅମ', 'پوٹاشیم'] },
  { key: 'soil_moisture', aliases: ['soil moisture', 'moisture', 'नमी', 'ओलावा', 'আর্দ্রতা', 'ભેજ', 'ਨਮੀ', 'ஈரப்பதம்', 'తేమ', 'ತೇವಾಂಶ', 'ഈർപ്പം', 'ଆର୍ଦ୍ରତା', 'نمی'] },
  { key: 'temperature', aliases: ['temperature', 'तापमान', 'तापमान', 'তাপমাত্রা', 'તાપમાન', 'ਤਾਪਮਾਨ', 'வெப்பநிலை', 'ఉష్ణోగ్రత', 'ತಾಪಮಾನ', 'താപനില', 'ତାପମାତ୍ରା', 'درجہ حرارت'] },
  { key: 'humidity', aliases: ['humidity', 'आर्द्रता', 'आर्द्रता', 'আর্দ্রতা', 'ભેજ', 'ਨਮੀ', 'ஈரப்பதம்', 'ఆర్ద్రత', 'ಆರ್ದ್ರತೆ', 'ആർദ്രത', 'ଆର୍ଦ୍ରତା', 'نمی'] },
];

export function findSensorKey(message) {
  const row = longestMatch(message, SENSOR_ALIASES);
  return row ? row.key : null;
}

export function findDistrict(message) {
  const hay = fold(message);
  let best = null;
  Object.entries(DISTRICTS).forEach(([state, list]) => {
    (list || []).forEach((name) => {
      const needle = fold(name);
      if (!needle || needle.length < 3) return;
      if (hay.includes(needle) && (!best || needle.length > best._len)) {
        best = { name, state, _len: needle.length };
      }
    });
  });
  if (!best) return null;
  delete best._len;
  return best;
}

export function refersToPrior(message) {
  const text = fold(message);
  return /\bit\b|\bits\b|\bthis\b|\bthat\b|\bthere\b|\byesterday\b/.test(text)
    || /यह|इस|उस|इसे|वहाँ|कल|ते|त्याचा|त्याची|इथे|সেটা|এটা|গতকাল|એ|તે|ਇਹ|ਉਸ|அது|அதன்|అది|ದದು|ಅದು|അത്|ଏହା|এইটো|یہ|اس|کل/.test(String(message || ''));
}
