import { motion, useReducedMotion } from 'framer-motion';
import { useLang } from '../../context/LanguageContext';
import ProductFrame from './ProductFrame';
import FieldFilm from '../../components/FieldFilm';
import { fadeUp } from './motion';

export default function ProductShowcase() {
  const reduce = useReducedMotion();
  const { t } = useLang();

  return (
    <section className="lp-showcase" id="product">
      <div className="lp-wrap">
        <motion.div className="lp-section-head" {...fadeUp(reduce)}>
          <p className="lp-section-label">{t.lp_intro_h2}</p>
          <h2>{t.lp_show_h2}</h2>
          <p className="lp-lede">
            {t.lp_show_lede}
          </p>
        </motion.div>
        <motion.div className="lp-show-split" {...fadeUp(reduce, 0.08)}>
          <FieldFilm className="lp-show-film" />
          <ProductFrame variant="showcase" />
        </motion.div>
      </div>
    </section>
  );
}
