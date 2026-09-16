import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useLang } from '../../context/LanguageContext';
import { fadeUp } from './motion';

export default function HardwareSection() {
  const reduce = useReducedMotion();
  const { t } = useLang();
  const steps = [t.lp_hw_field, t.lp_hw_sensors, t.lp_hw_data, t.lp_hw_brand, t.lp_hw_action];

  return (
    <section className="lp-hw" id="hardware">
      <div className="lp-wrap">
        <motion.div className="lp-section-head" {...fadeUp(reduce)}>
          <p className="lp-hw-flag">{t.lp_hw_flag}</p>
          <h2>{t.lp_hw_h2}</h2>
          <p className="lp-lede">
            {t.lp_hw_lede}
          </p>
        </motion.div>
        <ol className="lp-hw-flow">
          {steps.map((step, i) => (
            <li key={step}>
              {i > 0 && <span aria-hidden />}
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
        <p className="lp-fine">{t.lp_hw_fine}</p>
        <Link to="/beta" className="lp-text-link">{t.lp_hw_link}</Link>
      </div>
    </section>
  );
}
