import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import DataBadge from '../../components/DataBadge';
import { useLang } from '../../context/LanguageContext';
import { fadeUp } from './motion';

export default function CropIntelligence() {
  const reduce = useReducedMotion();
  const { t } = useLang();
  const flow = [t.lp_flow_soil, t.lp_flow_field, t.lp_flow_ai, t.lp_flow_reco];
  const reasons = [t.lp_why_soil, t.lp_why_region, t.lp_why_field];

  return (
    <section className="lp-crop" id="crop">
      <div className="lp-wrap">
        <motion.div className="lp-section-head" {...fadeUp(reduce)}>
          <h2>{t.lp_crop_h2}</h2>
        </motion.div>
        <ol className="lp-flow">
          {flow.map((step, i) => (
            <li key={step}>
              {i > 0 && <span className="lp-flow-join" aria-hidden />}
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
        <motion.article className="lp-reco" {...fadeUp(reduce, 0.08)}>
          <div>
            <p className="lp-section-label">{t.lp_reco_crop}</p>
            <h3>{t.lp_wheat}</h3>
            <DataBadge kind="demo" />
          </div>
          <div>
            <p>{t.lp_suitability}</p>
            <div className="lp-bar" aria-hidden>
              <span style={{ width: '82%' }} />
            </div>
            <p className="lp-reco-why">{t.lp_why}</p>
            <ul>
              {reasons.map((reason) => (
                <li key={reason}><Check size={16} strokeWidth={2.2} /> {reason}</li>
              ))}
            </ul>
            <p className="lp-fine">{t.lp_crop_fine}</p>
          </div>
        </motion.article>
      </div>
    </section>
  );
}
