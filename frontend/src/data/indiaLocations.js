import raw from './india-states-districts.json';

const extra = {
  'Andaman and Nicobar Islands': ['Nicobar', 'North and Middle Andaman', 'South Andaman'],
  Ladakh: ['Kargil', 'Leh'],
};

export const DISTRICTS = {
  ...Object.fromEntries(raw.states.map((row) => [row.state, row.districts])),
  ...extra,
};

export const STATES = Object.keys(DISTRICTS);

export const TALUKAS = {
  Maharashtra: {
    Thane: ['Thane', 'Kalyan', 'Bhiwandi', 'Ulhasnagar', 'Ambarnath', 'Murbad', 'Shahapur'],
    Nashik: ['Nashik', 'Niphad', 'Sinnar', 'Igatpuri', 'Dindori', 'Yeola', 'Malegaon'],
    Pune: ['Haveli', 'Baramati', 'Junnar', 'Maval', 'Shirur', 'Indapur', 'Pune'],
    Nagpur: ['Nagpur', 'Kamptee', 'Katol', 'Ramtek', 'Umred', 'Parseoni'],
  },
  'Madhya Pradesh': {
    Indore: ['Indore', 'Mhow', 'Depalpur', 'Sanwer', 'Hatod'],
    Bhopal: ['Huzur', 'Berasia', 'Bhopal'],
    Ujjain: ['Ujjain', 'Nagda', 'Khachrod', 'Mahidpur'],
  },
  Karnataka: {
    'Bengaluru (Bangalore) Urban': ['Bengaluru North', 'Bengaluru South', 'Bengaluru East', 'Anekal', 'Yelahanka'],
    Mysuru: ['Mysuru', 'Nanjangud', 'Hunsur', 'T. Narasipur'],
  },
  Gujarat: {
    Ahmedabad: ['Ahmedabad City', 'Daskroi', 'Sanand', 'Viramgam', 'Dholka'],
    Surat: ['Surat City', 'Olpad', 'Bardoli', 'Mandvi', 'Kamrej'],
  },
  Punjab: {
    Ludhiana: ['Ludhiana East', 'Ludhiana West', 'Khanna', 'Samrala', 'Payal', 'Jagraon'],
    Amritsar: ['Amritsar I', 'Amritsar II', 'Ajnala', 'Baba Bakala'],
  },
  'Tamil Nadu': {
    Coimbatore: ['Coimbatore North', 'Coimbatore South', 'Sulur', 'Pollachi', 'Mettupalayam'],
    Madurai: ['Madurai North', 'Madurai South', 'Melur', 'Vadipatti', 'Thirumangalam'],
  },
};

export { LANGUAGES } from '../utils/i18n-catalog';

export function districtsFor(state) {
  return DISTRICTS[state] || [];
}

export function talukasFor(state, district) {
  return TALUKAS[state]?.[district] || [];
}
