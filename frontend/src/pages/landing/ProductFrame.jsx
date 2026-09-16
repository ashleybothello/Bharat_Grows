import DataBadge from '../../components/DataBadge';
import { useLang } from '../../context/LanguageContext';

const DEMO = {
  moisture: '72%',
  nitrogen: '48 kg/ha',
  temperature: '28°C',
};

export default function ProductFrame({ variant = 'hero' }) {
  const demo = variant === 'showcase';
  const { t } = useLang();

  return (
    <div className={`lp-frame lp-frame-${variant}`} aria-hidden={variant === 'hero' ? true : undefined}>
      <div className="lp-frame-bar">
        <span className="lp-frame-brand">{t.lp_brand}</span>
        <span>{t.pf_field_intel}</span>
      </div>
      <div className="lp-frame-tabs" role="presentation">
        <span className="is-on">{t.lp_nav_soil}</span>
        <span>{t.lp_intro_crop_t}</span>
        <span>{t.lp_nav_market}</span>
        <span>{t.lp_nav_saathi}</span>
      </div>
      <div className="lp-frame-body">
        <div className="lp-frame-overview">
          <p>{t.pf_overview}</p>
          <strong>{demo ? t.pf_preview : t.pf_waiting}</strong>
          {demo ? <DataBadge kind="demo" /> : <DataBadge kind="waiting" />}
        </div>
        <dl className="lp-frame-metrics">
          <div>
            <dt>{t.pf_soil_health}</dt>
            <dd>{demo ? t.pf_health_good : '—'}</dd>
          </div>
          <div>
            <dt>{t.lp_moisture}</dt>
            <dd className="tabular">{demo ? DEMO.moisture : '—'}</dd>
          </div>
          <div>
            <dt>{t.lp_nitrogen}</dt>
            <dd className="tabular">{demo ? DEMO.nitrogen : '—'}</dd>
          </div>
          <div>
            <dt>{t.lp_temp}</dt>
            <dd className="tabular">{demo ? DEMO.temperature : '—'}</dd>
          </div>
        </dl>
        <div className="lp-frame-crop">
          <span>{t.pf_crop_reco}</span>
          <strong>{demo ? t.lp_wheat : t.pf_from_soil}</strong>
        </div>
      </div>
      {demo && (
        <p className="lp-frame-note">{t.pf_note}</p>
      )}
    </div>
  );
}
