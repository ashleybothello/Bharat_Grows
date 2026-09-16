/**
 * Crop model vocabulary -> Government OGD / AGMARKNET commodity vocabulary.
 *
 * The crop model emits its 37 training labels ("rice", "soybean", "blackgram").
 * AGMARKNET publishes different names for the same produce ("Paddy(Common)",
 * "Soyabean", "Black Gram(Urd Beans)(Whole)"). Without this bridge every price
 * lookup misses and the decision engine loses its market component.
 *
 * Each entry is an ORDERED list of candidate commodity names. Lookups try them
 * in order and stop at the first one with a real published price. Names were
 * taken from the live OGD feed; unverified guesses are listed last so they only
 * ever act as a fallback, and a crop with no match is reported as unpriced
 * rather than being given an invented price.
 *
 * The model label stays the key everywhere in BharatGrow's own responses — only
 * the outbound market query uses the government's spelling.
 */

const CROP_TO_COMMODITY = {
  apple: ['Apple'],
  banana: ['Banana', 'Banana - Green'],
  blackgram: ['Black Gram(Urd Beans)(Whole)', 'Black Gram Dal(Urd Dal)'],
  blackpepper: ['Black pepper'],
  cardamom: ['Cardamoms'],
  chickpea: ['Bengal Gram(Gram)(Whole)', 'Kabuli Chana(Chickpeas-White)', 'Gram Raw(Chholia)'],
  chilli: ['Dry Chillies', 'Green Chilli', 'Chili Red'],
  coconut: ['Coconut', 'Tender Coconut'],
  coffee: ['Coffee'],
  cotton: ['Cotton'],
  ginger: ['Ginger(Green)', 'Ginger(Dry)'],
  grapes: ['Grapes'],
  groundnut: ['Groundnut', 'Groundnut pods(raw)', 'Groundnut(Split)'],
  jute: ['Jute'],
  kidneybeans: ['Rajgira', 'Kidney Beans', 'French Beans(Frasbean)'],
  lentil: ['Lentil(Masur)(Whole)', 'Masur Dal'],
  maize: ['Maize', 'Sweet Corn', 'Baby Corn'],
  mango: ['Mango', 'Mango(Raw-Ripe)'],
  mothbeans: ['Moth Dal', 'Kulthi(Horse Gram)'],
  mungbean: ['Green Gram(Moong)(Whole)', 'Green Gram Dal(Moong Dal)'],
  muskmelon: ['Muskmelon'],
  mustard: ['Mustard', 'Mustard Oil'],
  onion: ['Onion', 'Onion Green'],
  orange: ['Orange', 'Mousambi(Sweet Lime)'],
  papaya: ['Papaya', 'Papaya(Raw)'],
  pigeonpeas: ['Red gram/Arhar/Tur(whole)', 'Red gram split/Arhar dal/Tur dal'],
  pomegranate: ['Pomegranate'],
  potato: ['Potato'],
  rice: ['Rice', 'Paddy(Common)', 'Paddy(Basmati)'],
  rubber: ['Rubber'],
  soybean: ['Soyabean'],
  sugarcane: ['Sugarcane'],
  tea: ['Tea'],
  tomato: ['Tomato'],
  turmeric: ['Turmeric'],
  watermelon: ['Water Melon'],
  wheat: ['Wheat'],
};

/**
 * Commodity names to try for a crop label, most likely first.
 * Unknown labels fall back to the label itself, capitalised.
 */
function commodityCandidates(cropLabel) {
  const key = String(cropLabel || '').trim().toLowerCase();
  if (CROP_TO_COMMODITY[key]) return CROP_TO_COMMODITY[key];
  if (!key) return [];
  return [key.charAt(0).toUpperCase() + key.slice(1)];
}

module.exports = { CROP_TO_COMMODITY, commodityCandidates };
