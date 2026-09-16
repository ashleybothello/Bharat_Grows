import { motion, useReducedMotion } from 'framer-motion';
import { useLang } from '../../context/LanguageContext';
import { fadeUp } from './motion';

export default function ProductIntro() {
  const reduce = useReducedMotion();
  const { t } = useLang();
  const items = [
    { n: '01', title: t.lp_intro_soil_t, body: t.lp_intro_soil_b },
    { n: '02', title: t.lp_intro_crop_t, body: t.lp_intro_crop_b },
    { n: '03', title: t.lp_intro_market_t, body: t.lp_intro_market_b },
    { n: '04', title: t.lp_intro_saathi_t, body: t.lp_intro_saathi_b },
  ];

  return (
    <section className="lp-intro" id="intro">
      <div className="lp-wrap lp-intro-grid">
        <motion.div {...fadeUp(reduce)}>
          <h2>{t.lp_intro_h2}</h2>
          <p className="lp-lede">
            {t.lp_intro_lede}
          </p>
        </motion.div>
        <ol className="lp-intro-list">
          {items.map((item, i) => (
            <motion.li key={item.n} {...fadeUp(reduce, i * 0.06)}>
              <span>{item.n}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
