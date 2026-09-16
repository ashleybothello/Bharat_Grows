import { motion, useReducedMotion } from 'framer-motion';
import { useLang } from '../../context/LanguageContext';
import { fadeUp } from './motion';

export default function HowItWorks() {
  const reduce = useReducedMotion();
  const { t } = useLang();
  const steps = [
    { n: '01', title: t.lp_how_1_t, body: t.lp_how_1_b },
    { n: '02', title: t.lp_how_2_t, body: t.lp_how_2_b },
    { n: '03', title: t.lp_how_3_t, body: t.lp_how_3_b },
  ];

  return (
    <section className="lp-how" id="how">
      <div className="lp-wrap">
        <motion.div className="lp-section-head" {...fadeUp(reduce)}>
          <h2>{t.lp_how_h2}</h2>
        </motion.div>
        <ol className="lp-how-grid">
          {steps.map((step, i) => (
            <motion.li key={step.n} {...fadeUp(reduce, i * 0.07)}>
              <span>{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
