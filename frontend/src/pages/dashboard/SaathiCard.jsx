import { ArrowUpRight } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { openSaathi } from './helpers';

export default function SaathiCard() {
  const { t } = useLang();

  return (
    <section className="dash-pane dash-saathi">
      <p className="dash-kicker dark">{t.dash_saathi}</p>
      <h2>{t.dash_saathi_p}</h2>
      <p>{t.dash_saathi_ask}</p>
      <ul className="dash-topics">
        <li>{t.dash_ask_soil}</li>
        <li>{t.dash_ask_crops}</li>
        <li>{t.dash_ask_market}</li>
        <li>{t.dash_ask_farming}</li>
      </ul>
      <button type="button" className="dash-btn" onClick={openSaathi}>
        {t.dash_talk} <ArrowUpRight size={16} />
      </button>
    </section>
  );
}
