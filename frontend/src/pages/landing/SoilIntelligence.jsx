import { motion, useReducedMotion } from 'framer-motion';
import DataBadge from '../../components/DataBadge';
import { useLang } from '../../context/LanguageContext';
import { fadeUp } from './motion';

export default function SoilIntelligence() {
  const reduce = useReducedMotion();
  const { t } = useLang();
  const cells = [
    { label: t.lp_ph, value: '6.8' },
    { label: t.lp_moisture, value: '72%' },
    { label: t.lp_nitrogen, value: '48' },
    { label: t.lp_phosphorus, value: '31' },
    { label: t.lp_potassium, value: '42' },
    { label: t.lp_temp, value: '28°C' },
  ];

  return (
    <section className="lp-soil" id="soil">
      <div className="lp-wrap lp-split">
        <motion.div {...fadeUp(reduce)}>
          <p className="lp-section-label">{t.lp_soil_label}</p>
          <h2>{t.lp_soil_h2}</h2>
          <p className="lp-lede">
            {t.lp_soil_lede}
          </p>
          <p className="lp-hw-flag">{t.lp_soil_flag}</p>
        </motion.div>
        <motion.aside className="lp-soil-board" {...fadeUp(reduce, 0.08)} aria-label={t.lp_soil_board}>
          <div className="lp-soil-board-top">
            <strong>{t.lp_soil_board}</strong>
            <DataBadge kind="demo" />
          </div>
          <dl>
            {cells.map((cell) => (
              <div key={cell.label}>
                <dt>{cell.label}</dt>
                <dd className="tabular">{cell.value}</dd>
              </div>
            ))}
          </dl>
          <p>{t.lp_soil_demo_note}</p>
        </motion.aside>
      </div>
    </section>
  );
}
