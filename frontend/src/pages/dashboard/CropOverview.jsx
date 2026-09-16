import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import DataBadge from '../../components/DataBadge';
import { useLang } from '../../context/LanguageContext';
import { cropLabel } from './helpers';

export default function CropOverview({ crop }) {
  const { t } = useLang();

  return (
    <section className="dash-pane">
      <header className="dash-panel-head">
        <div>
          <p className="dash-kicker dark">{t.dash_crop_intel}</p>
          <h2>{t.dash_crop_lede}</h2>
        </div>
        <DataBadge kind={crop ? 'analysis' : 'waiting'} />
      </header>
      <dl className="dash-crop-meta">
        <div>
          <dt>{t.dash_current_crop}</dt>
          <dd>{crop ? cropLabel(crop, t) : t.dash_not_analyzed}</dd>
        </div>
        <div>
          <dt>{t.dash_reco}</dt>
          <dd>{crop ? cropLabel(crop, t) : t.dash_reco_after}</dd>
        </div>
      </dl>
      <Link to="/app/analyze" className="dash-btn">
        {t.dash_analyze_crop} <ArrowUpRight size={16} />
      </Link>
    </section>
  );
}
