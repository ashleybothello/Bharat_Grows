import { LANGUAGES } from '../data/indiaLocations';
import { useLang } from '../context/LanguageContext';

export default function LanguageSelect({ variant = 'plain' }) {
  const { lang, setLang, t } = useLang();

  return (
    <label className={`lang-select lang-select-${variant}`}>
      <span className="visually-hidden">{t.lang_label}</span>
      <select
        value={lang}
        aria-label={t.lang_label}
        onChange={(e) => setLang(e.target.value)}
      >
        {LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>{item.label}</option>
        ))}
      </select>
    </label>
  );
}
