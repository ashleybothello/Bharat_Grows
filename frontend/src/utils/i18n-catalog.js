export const LANG_CODES = ['en', 'hi', 'mr', 'bn', 'gu', 'pa', 'ta', 'te', 'kn', 'ml', 'or', 'as', 'ur'];

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'gu', label: 'ગુજરાતી' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'മലയാളം' },
  { code: 'or', label: 'ଓଡ଼ିଆ' },
  { code: 'as', label: 'অসমীয়া' },
  { code: 'ur', label: 'اردو' },
];

export const RTL_LANGS = new Set(['ur']);

export const BCP47 = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  or: 'or-IN',
  as: 'as-IN',
  ur: 'ur-IN',
};

export const SCRIPT_FOR = {
  en: 'latn',
  hi: 'deva',
  mr: 'deva',
  bn: 'beng',
  as: 'beng',
  gu: 'gujr',
  pa: 'guru',
  ta: 'taml',
  te: 'telu',
  kn: 'knda',
  ml: 'mlym',
  or: 'orya',
  ur: 'arab',
};

export function isLangCode(code) {
  return LANG_CODES.includes(code);
}

export function localeFor(lang) {
  return BCP47[lang] || 'en-IN';
}

export function scriptFor(lang) {
  return SCRIPT_FOR[lang] || 'latn';
}

export function isRtl(lang) {
  return RTL_LANGS.has(lang);
}

export function interpolate(template, vars = {}) {
  if (typeof template === 'function') return template;
  if (template == null) return '';
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] == null ? '' : String(vars[key])
  ));
}

/** If the user typed a different supported script, reply in that language. */
export function detectReplyLang(message, currentLang = 'en') {
  const text = String(message || '');
  if (/[\u0600-\u06FF]/.test(text)) return 'ur';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
  if (/[\u0980-\u09FF]/.test(text)) return currentLang === 'as' ? 'as' : 'bn';
  if (/[\u0900-\u097F]/.test(text)) return currentLang === 'mr' ? 'mr' : 'hi';
  return isLangCode(currentLang) ? currentLang : 'en';
}
