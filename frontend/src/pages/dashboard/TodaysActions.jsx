import { Link } from 'react-router-dom';
import { Cpu, FlaskConical, Sparkles, TrendingUp } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { cropLabel, openSaathi } from './helpers';

export default function TodaysActions({ hasSoil, crop }) {
  const { t } = useLang();

  return (
    <section className="dash-pane">
      <h2>{t.dash_actions}</h2>
      <ul className="dash-actions">
        {!hasSoil ? (
          <li>
            <FlaskConical size={18} />
            <div>
              <Link to="/app/analyze"><strong>{t.dash_act_soil}</strong></Link>
              <span>{t.dash_act_soil_p}</span>
            </div>
          </li>
        ) : (
          <li>
            <FlaskConical size={18} />
            <div>
              <Link to="/app/results"><strong>{t.dash_act_review}</strong></Link>
              <span>{t.dash_act_review_p}{crop ? ` — ${cropLabel(crop, t)}` : ''}</span>
            </div>
          </li>
        )}
        <li>
          <TrendingUp size={18} />
          <div>
            <Link to="/app/market"><strong>{t.dash_act_market}</strong></Link>
            <span>{t.dash_act_market_p}</span>
          </div>
        </li>
        <li>
          <Sparkles size={18} />
          <div>
            <button type="button" onClick={openSaathi}><strong>{t.dash_act_saathi}</strong></button>
            <span>{t.dash_act_saathi_p}</span>
          </div>
        </li>
        <li>
          <Cpu size={18} />
          <div>
            <Link to="/beta"><strong>{t.dash_act_hw}</strong></Link>
            <span>{t.dash_act_hw_p}</span>
          </div>
        </li>
      </ul>
    </section>
  );
}
