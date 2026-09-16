import { motion, useReducedMotion } from 'framer-motion';
import { useLang } from '../../context/LanguageContext';
import { fadeUp } from './motion';

export default function BuiltForBharat() {
  const reduce = useReducedMotion();
  const { t } = useLang();
  const marks = [t.lp_mark_soil, t.lp_mark_crop, t.lp_mark_market, t.lp_mark_region, t.lp_mark_lang, t.lp_mark_field];

  return (
    <section className="lp-bharat" id="bharat">
      <div className="lp-wrap">
        <motion.div {...fadeUp(reduce)}>
          <h2>{t.lp_bharat_h2}</h2>
          <p className="lp-bharat-lines">
            {t.lp_bharat_soils}<br />
            {t.lp_bharat_crops}<br />
            {t.lp_bharat_mandis}<br />
            {t.lp_bharat_one}
          </p>
        </motion.div>
        <ul className="lp-marks">
          {marks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
