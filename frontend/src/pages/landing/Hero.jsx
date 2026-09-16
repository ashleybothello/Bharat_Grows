import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import ProductFrame from './ProductFrame';
import Greenery from './Greenery';
import { ease, heroReveal, scrollToId } from './motion';

export default function Hero() {
  const reduce = useReducedMotion();
  const { isAuthed } = useAuth();
  const { t } = useLang();

  return (
    <section className="lp-hero">
      <div className="lp-hero-film" aria-hidden="true">
        <img
          className="lp-hero-green"
          src="/farm_hero.png"
          alt=""
          decoding="async"
        />
      </div>
      <Greenery />
      <div className="lp-hero-shade" />
      <div className="lp-wrap lp-hero-grid">
        <div>
          <motion.p className="lp-brandline" {...heroReveal(reduce, 0.08)}>
            {t.lp_brand}
          </motion.p>
          <motion.h1 {...heroReveal(reduce, 0.16)}>
            {t.lp_hero_line1}<br />{t.lp_hero_line2}
          </motion.h1>
          <motion.p className="lp-lede" {...heroReveal(reduce, 0.28)}>
            {t.lp_hero_lede}
          </motion.p>
          <motion.div className="lp-hero-actions" {...heroReveal(reduce, 0.4)}>
            <Link to={isAuthed ? '/app/dashboard' : '/signup'} className="lp-btn lp-btn-light">
              {isAuthed ? t.lp_open_dashboard : t.lp_start_smarter} <ArrowUpRight size={16} />
            </Link>
            <button type="button" className="lp-btn lp-btn-ghost" onClick={() => scrollToId('intro', reduce)}>
              {t.lp_explore}
            </button>
          </motion.div>
        </div>
        <motion.div
          className="lp-hero-frame"
          initial={reduce ? false : { opacity: 0, x: 40, filter: 'blur(14px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1, delay: 0.28, ease }}
        >
          <motion.div
            animate={reduce ? undefined : { y: [0, -12, 0] }}
            transition={{ duration: 9.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ProductFrame variant="hero" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
