import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { fade } from './helpers';

export default function PrimaryAction({ reduce }) {
  const { t } = useLang();

  return (
    <motion.section className="dash-primary" {...fade(reduce, 0.05)}>
      <div>
        <p className="dash-kicker dark">{t.nav_analyze}</p>
        <h2>{t.dash_analyze_h}</h2>
        <p>{t.dash_analyze_p}</p>
        <div className="dash-cta-row">
          <Link to="/app/analyze" className="dash-btn">
            {t.dash_start} <ArrowUpRight size={16} />
          </Link>
          <Link to="/app/market" className="dash-btn ghost">
            {t.dash_view_market} <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
      <div className="dash-primary-visual" aria-hidden="true">
        <span>{t.lp_brand}</span>
        <strong>{t.pf_field_intel}</strong>
        <em>{t.dash_waiting_data}</em>
      </div>
    </motion.section>
  );
}
