import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { fadeUp } from './motion';

export default function SaathiSection() {
  const reduce = useReducedMotion();
  const { t } = useLang();

  return (
    <section className="lp-saathi" id="saathi">
      <div className="lp-wrap lp-split">
        <motion.div {...fadeUp(reduce)}>
          <h2>{t.lp_saathi_h2}</h2>
          <p className="lp-lede">
            {t.lp_saathi_lede}
          </p>
          <Link to="/login" className="lp-text-link">{t.lp_saathi_link}</Link>
        </motion.div>
        <motion.div className="lp-saathi-ui" {...fadeUp(reduce, 0.08)}>
          <header>
            <Sparkles size={16} />
            <div>
              <strong>{t.lp_nav_saathi}</strong>
              <span>{t.lp_saathi_preview}</span>
            </div>
          </header>
          <div className="lp-chat">
            <p className="lp-chat-user">{t.lp_saathi_q}</p>
            <p className="lp-chat-bot">
              {t.lp_saathi_a}
            </p>
            <div className="lp-chat-chips">
              <span>{t.lp_wheat}</span>
              <span>Soybean</span>
              <span>Maize</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
