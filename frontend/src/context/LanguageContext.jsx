import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translations } from '../utils/i18n';
import { interpolate, isLangCode, isRtl, localeFor, scriptFor } from '../utils/i18n-catalog';

function makeT(lang) {
  const current = translations[lang] || {};
  const fallback = translations.en || {};
  const lookup = (prop) => {
    const value = current[prop];
    return value != null ? value : fallback[prop];
  };
  const format = (key, vars) => {
    const value = lookup(key);
    if (typeof value === 'function') return value(vars);
    return interpolate(value, vars);
  };
  return new Proxy({ format }, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (prop === 'format') return target.format;
      const value = lookup(prop);
      return value != null ? value : '';
    },
  });
}

const LanguageContext = createContext({
  lang: 'en',
  locale: 'en-IN',
  dir: 'ltr',
  setLang: () => {},
  t: makeT('en'),
});

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem('soilai_lang');
    return isLangCode(stored) ? stored : 'en';
  });

  const changeLang = (newLang) => {
    const next = isLangCode(newLang) ? newLang : 'en';
    setLang(next);
    localStorage.setItem('soilai_lang', next);
  };

  const t = useMemo(() => makeT(lang), [lang]);
  const locale = localeFor(lang);
  const dir = isRtl(lang) ? 'rtl' : 'ltr';

  useEffect(() => {
    const nextDir = isRtl(lang) ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = nextDir;
    document.documentElement.dataset.script = scriptFor(lang);
    document.body?.setAttribute('dir', nextDir);
    const line1 = t.lp_hero_line1 || '';
    const line2 = t.lp_hero_line2 || '';
    const brand = t.lp_brand || 'BharatGrow';
    document.title = [brand, [line1, line2].filter(Boolean).join(' ')].filter(Boolean).join(' — ');
  }, [lang, t]);

  return (
    <LanguageContext.Provider value={{ lang, locale, dir, setLang: changeLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => useContext(LanguageContext);

export function tFor(lang) {
  return makeT(isLangCode(lang) ? lang : 'en');
}
