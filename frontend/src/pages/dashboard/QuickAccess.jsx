import { Link } from 'react-router-dom';
import { Cpu, FlaskConical, History, Map, Sparkles, TrendingUp } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { openSaathi } from './helpers';

export default function QuickAccess() {
  const { t } = useLang();

  return (
    <nav className="dash-quick" aria-label={t.dash_quick}>
      <p className="dash-kicker dark">{t.dash_quick}</p>
      <div>
        <Link to="/app/analyze"><FlaskConical size={18} /> {t.nav_analyze}</Link>
        <Link to="/app/market"><TrendingUp size={18} /> {t.nav_market}</Link>
        <Link to="/app/history"><History size={18} /> {t.nav_history}</Link>
        <Link to="/app/iot"><Map size={18} /> {t.nav_map}</Link>
        <button type="button" onClick={openSaathi}><Sparkles size={18} /> {t.dash_saathi}</button>
        <Link to="/beta"><Cpu size={18} /> {t.dash_hardware}</Link>
      </div>
    </nav>
  );
}
