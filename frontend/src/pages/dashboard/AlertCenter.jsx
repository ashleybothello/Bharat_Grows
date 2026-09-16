import { Link } from 'react-router-dom';
import { History, Radio } from 'lucide-react';
import DataBadge from '../../components/DataBadge';
import { useLang } from '../../context/LanguageContext';

export default function AlertCenter({ historyError, nodesPack, latestAnomaly, nodeCounts }) {
  const { t } = useLang();
  const critical = (nodesPack?.nodes || []).filter((n) => n.health === 'CRITICAL');
  const waiting = !nodesPack;

  return (
    <section className="dash-alerts">
      <header className="dash-panel-head">
        <h2>{t.dash_alerts}</h2>
        <DataBadge kind={critical.length ? 'error' : waiting ? 'waiting' : 'demo'} />
      </header>
      {nodeCounts?.total > 0 && (
        <p className="dash-fine">
          {t.pg_dash_healthy} {nodeCounts.healthy} · {t.pg_dash_warning} {nodeCounts.warning} · {t.pg_dash_critical} {nodeCounts.critical}
        </p>
      )}
      {latestAnomaly && (
        <article className="dash-alert is-warn">
          <Radio size={18} />
          <div>
            <strong>{t.pg_map_latest}</strong>
            <p>
              {t.pg_map_node} {latestAnomaly.node_number || latestAnomaly.node_id} · {latestAnomaly.sensor} · {latestAnomaly.value}
            </p>
            <p className="tabular">{latestAnomaly.detected_at ? new Date(latestAnomaly.detected_at).toLocaleString() : ''}</p>
            <p>
              {latestAnomaly.email_sent ? t.pg_hist_email_sent : t.pg_hist_email_pending}
              {' · '}
              {latestAnomaly.sms_sent ? t.pg_hist_sms_sent : t.pg_hist_sms_pending}
            </p>
            <Link to="/app/history">{t.pg_hist_tab_alerts}</Link>
          </div>
        </article>
      )}
      {critical.length > 0 ? (
        critical.map((node) => (
          <article className="dash-alert is-warn" key={node.nodeId}>
            <Radio size={18} />
            <div>
              <strong>{t.pg_map_node} {node.nodeNumber} — CRITICAL</strong>
              <p>{(node.criticalSensors || []).join(', ') || node.zone}</p>
              <Link to="/app/iot">{t.nav_iot}</Link>
            </div>
          </article>
        ))
      ) : (
        <article className="dash-alert">
          <Radio size={18} />
          <div>
            <strong>{t.pg_dash_sim}</strong>
            <p>{nodesPack ? t.pg_iot_sim_p : t.dash_alert_hw_p}</p>
            <Link to="/app/iot">{t.nav_iot}</Link>
          </div>
        </article>
      )}
      {historyError && (
        <article className="dash-alert is-warn">
          <History size={18} />
          <div>
            <strong>{t.dash_alert_hist}</strong>
            <p>{t.dash_alert_hist_p}</p>
          </div>
        </article>
      )}
    </section>
  );
}
