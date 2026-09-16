import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import DataBadge from '../../components/DataBadge';
import { useLang } from '../../context/LanguageContext';
import Metric from './Metric';
import { qualityLabel } from './helpers';

export default function SoilOverview({ hasSoil, lastAnalysis, liveNode }) {
  const { t } = useLang();
  const n = liveNode?.sensors?.nitrogen?.value ?? lastAnalysis?.n;
  const p = liveNode?.sensors?.phosphorus?.value ?? lastAnalysis?.p;
  const k = liveNode?.sensors?.potassium?.value ?? lastAnalysis?.k;
  const moisture = liveNode?.sensors?.soil_moisture?.value ?? lastAnalysis?.moisture;
  const temp = liveNode?.sensors?.temperature?.value ?? lastAnalysis?.temperature;
  const health = liveNode?.health || lastAnalysis?.soil_quality;

  return (
    <section className="dash-pane">
      <header className="dash-panel-head">
        <div>
          <p className="dash-kicker dark">{t.dash_soil_intel}</p>
          <h2>{t.dash_soil_lede}</h2>
        </div>
        <DataBadge kind={liveNode ? 'demo' : hasSoil ? 'analysis' : 'waiting'} />
      </header>
      {hasSoil ? (
        <>
          <dl className="dash-cells">
            <Metric label={t.dash_soil_health} value={liveNode ? health : qualityLabel(health, t)} />
            <Metric label={t.lp_moisture} value={moisture != null ? `${moisture}%` : '—'} />
            <Metric label={t.lp_nitrogen} value={n ?? '—'} />
            <Metric label={t.lp_phosphorus} value={p ?? '—'} />
            <Metric label={t.lp_potassium} value={k ?? '—'} />
            <Metric label={t.lp_temp} value={temp != null ? `${temp}°C` : '—'} />
          </dl>
          <p className="dash-fine">{liveNode ? `${t.pg_dash_sim} · ${t.pg_map_node} ${liveNode.nodeNumber}` : t.dash_from_test}</p>
          <Link to={liveNode ? '/app/iot' : '/app/results'} className="dash-text">
            {liveNode ? t.nav_iot : t.dash_open_report} <ArrowUpRight size={14} />
          </Link>
        </>
      ) : (
        <div className="dash-empty">
          <strong>{t.badge_waiting}</strong>
          <p>{t.dash_soil_empty}</p>
          <Link to="/app/analyze" className="dash-btn">
            {t.dash_start} <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
    </section>
  );
}
