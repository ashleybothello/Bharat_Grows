import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { fadeUp } from './motion';

export default function FinalCTA() {
  const reduce = useReducedMotion();
  const { isAuthed } = useAuth();
  const { t } = useLang();

  return (
    <section className="lp-cta" id="start">
      <motion.div className="lp-wrap lp-cta-inner" {...fadeUp(reduce)}>
        <h2>{t.lp_cta_h2}</h2>
        <p>
          {t.lp_cta_lede}
        </p>
        <Link to={isAuthed ? '/app/dashboard' : '/signup'} className="lp-btn lp-btn-light">
          {isAuthed ? t.lp_open_dashboard : t.lp_start_smarter} <ArrowUpRight size={15} />
        </Link>
      </motion.div>
    </section>
  );
}
