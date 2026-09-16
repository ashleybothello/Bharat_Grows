import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, CloudRain, Cpu, Droplets, Flame, Leaf,
  Radio, RotateCcw, Sun, Thermometer, Waves, X,
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import DataBadge from '../components/DataBadge';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import {
  clearAnomaly,
  fetchNode,
  fetchNodes,
  fetchTelemetryTrends,
  telemetryErrorMessage,
  triggerAnomaly,
} from '../utils/telemetry';
import { completeAction, emitPageGone, emitPageReady, setUiContext, subscribeSaathi } from '../utils/saathi/bus';
import { localeFor } from '../utils/i18n-catalog';
import { qualityLabel } from './dashboard/helpers';

const RANGES = ['1d', '1w', '1m', '1y'];
const GRAPH_SENSORS = [
  'nitrogen', 'phosphorus', 'potassium', 'soil_moisture',
  'temperature', 'humidity', 'light', 'rain', 'water_level',
];
const CRITICAL_PIN = {
  nitrogen: 7,
  phosphorus: 3,
  potassium: 6,
  soil_moisture: 12,
  temperature: 8,
  humidity: 12,
  light: 40,
  water_level: 15,
  flame: 1,
};
const SENSOR_ICONS = {
  nitrogen: Leaf,
  phosphorus: Leaf,
  potassium: Leaf,
  soil_moisture: Droplets,
  temperature: Thermometer,
  humidity: CloudRain,
  light: Sun,
  rain: CloudRain,
  water_level: Waves,
  flame: Flame,
  pir: Activity,
};

function healthClass(health) {
  if (health === 'CRITICAL') return 'is-critical';
  if (health === 'BAD' || health === 'AVERAGE') return 'is-watch';
  if (health === 'GOOD') return 'is-good';
  return 'is-unknown';
}

function formatTime(iso, lang) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(localeFor(lang), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

function sensorLabel(key, catalogue, t) {
  const found = catalogue.find((s) => s.key === key);
  if (found?.label) return found.label;
  return t[`pg_sensor_${key}`] || key;
}

function padNode(n) {
  return String(n).padStart(2, '0');
}

function notificationNotice(result, t) {
  const smsOk = Boolean(result?.notifications?.sms?.sent);
  const emailOk = Boolean(result?.notifications?.email?.sent);
  if (smsOk && emailOk) return t.pg_map_alert_both;
  if (smsOk) return t.pg_map_alert_sms_only;
  if (emailOk) return t.pg_map_alert_email_only;
  return t.pg_map_alert_neither;
}

export default function IoTTelemetry() {
  const { t, lang } = useLang();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [pack, setPack] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [range, setRange] = useState('1d');
  const [sensor, setSensor] = useState('nitrogen');
  const [series, setSeries] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState(null);
  const [anomalyNode, setAnomalyNode] = useState('');
  const [anomalySensor, setAnomalySensor] = useState('nitrogen');
  const [panelTab, setPanelTab] = useState('live');
  const [layer, setLayer] = useState('field');

  const load = useCallback(async () => {
    try {
      const data = await fetchNodes();
      setPack(data);
      setError('');
    } catch (err) {
      setError(telemetryErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (error === t.pg_map_auth) return undefined;
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load, error, t.pg_map_auth]);

  const onSignInAgain = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const nodes = pack?.nodes || [];
  const catalogue = pack?.sensorCatalogue || [];
  const coverage = pack?.coverage;
  const farm = pack?.farm;
  const tally = pack?.tally || {};
  const healthy = tally.GOOD || 0;
  const warning = (tally.AVERAGE || 0) + (tally.BAD || 0);
  const critical = tally.CRITICAL || 0;

  useEffect(() => {
    if (!nodes.length) return;
    setAnomalyNode((current) => {
      if (current && nodes.some((n) => n.nodeId === current)) return current;
      const third = nodes.find((n) => n.nodeNumber === 3) || nodes[0];
      return third.nodeId;
    });
    setSelectedId((current) => {
      if (current && nodes.some((n) => n.nodeId === current)) return current;
      const hot = nodes.find((n) => n.health === 'CRITICAL');
      return (hot || nodes[0]).nodeId;
    });
  }, [nodes]);

  const selected = useMemo(
    () => nodes.find((n) => n.nodeId === selectedId) || null,
    [nodes, selectedId],
  );

  const packRef = useRef(nodes);
  packRef.current = nodes;

  useEffect(() => {
    setUiContext({
      selectedNode: selected ? { nodeId: selected.nodeId, nodeNumber: selected.nodeNumber, zone: selected.zone, health: selected.health } : null,
    });
  }, [selected]);

  useEffect(() => {
    emitPageReady('map');
    const handle = async (action) => {
      const started = Date.now();
      while (!(packRef.current || []).length && Date.now() - started < 8000) {
        await new Promise((r) => setTimeout(r, 120));
      }
      const list = packRef.current || [];
      const node = list.find((n) => Number(n.nodeNumber) === Number(action.nodeNumber));
      if (!node) {
        completeAction(action.id, { ok: false, type: action.type, error: 'missing_node' });
        return;
      }
      setSelectedId(node.nodeId);
      if (action.type === 'showNodeAnomaly') setPanelTab('live');
      completeAction(action.id, {
        ok: true,
        type: action.type,
        nodeId: node.nodeId,
        nodeNumber: node.nodeNumber,
        health: node.health,
        zone: node.zone,
      });
    };
    const unsub = subscribeSaathi(['selectNode', 'showNodeDetails', 'showNodeAnomaly'], handle);
    return () => {
      unsub();
      emitPageGone('map');
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSeries(null);
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [trend, node] = await Promise.all([
          fetchTelemetryTrends({ sensor, range, nodeId: selectedId }),
          fetchNode(selectedId),
        ]);
        if (!cancelled) {
          setSeries(trend);
          setDetail(node);
        }
      } catch {
        if (!cancelled) setSeries(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, sensor, range, pack?.nodes]);

  const gradedSensors = useMemo(
    () => catalogue.filter((s) => CRITICAL_PIN[s.key] != null),
    [catalogue],
  );

  const onAnomaly = async () => {
    const target = nodes.find((n) => n.nodeId === anomalyNode) || nodes[0];
    if (!target || busy) return;
    const pin = CRITICAL_PIN[anomalySensor] ?? 7;
    setBusy(true);
    setNotice('');
    try {
      const result = await triggerAnomaly({
        nodeId: target.nodeId,
        sensor: anomalySensor,
        value: pin,
        ticks: 90,
      });
      setSelectedId(target.nodeId);
      setPanelTab('live');
      setNotice(notificationNotice(result, t));
      await load();
    } catch (err) {
      setNotice(telemetryErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    const targetId = selectedId || anomalyNode;
    if (!targetId || busy) return;
    setBusy(true);
    try {
      const result = await clearAnomaly(targetId);
      setNotice(result.message);
      await load();
    } catch (err) {
      setNotice(telemetryErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const criticalReasons = Object.values(selected?.sensors || {})
    .filter((item) => item.status === 'CRITICAL')
    .map((item) => item.label);

  return (
    <div className="farm-page farm-map-page">
      <PageHeader
        kicker={t.nav_map}
        title={t.pg_map_h}
        lede={t.pg_iot_sim}
        tools={(
          <>
            <DataBadge kind="demo" />
            <Link to="/beta" className="farm-ghost-btn">
              <Cpu size={15} /> {t.pg_iot_beta}
            </Link>
          </>
        )}
      />

      {loading && <div className="skel" style={{ height: 420 }} />}

      {!loading && error && (
        <p className="az-error farm-map-error" role="alert">
          {error}
          {error === t.pg_map_auth ? (
            <button type="button" className="btn-secondary" onClick={onSignInAgain}>{t.login_h1}</button>
          ) : (
            <button type="button" className="btn-secondary" onClick={load}>{t.pg_hist_retry}</button>
          )}
        </p>
      )}

      {!loading && (
        <>
          <section className="farm-map-stats" aria-label={t.pg_dash_nodes}>
            <article className="farm-stat">
              <span className="farm-stat-ico" aria-hidden>▣</span>
              <div>
                <strong className="tabular">{nodes.length}</strong>
                <p>{t.pg_map_active}</p>
                <em>
                  {coverage?.totalNodes
                    ? t.pg_map_of_possible.replace('{n}', String(coverage.totalNodes))
                    : farm?.sizeLabel || ''}
                </em>
              </div>
            </article>
            <article className="farm-stat is-good">
              <span className="farm-stat-dot is-good" />
              <div>
                <strong className="tabular">{healthy}</strong>
                <p>{t.pg_dash_healthy}</p>
                <em>{t.pg_map_legend_good}</em>
              </div>
            </article>
            <article className="farm-stat is-watch">
              <span className="farm-stat-dot is-watch" />
              <div>
                <strong className="tabular">{warning}</strong>
                <p>{t.pg_dash_warning}</p>
                <em>{t.pg_map_legend_watch}</em>
              </div>
            </article>
            <article className="farm-stat is-critical">
              <span className="farm-stat-dot is-critical" />
              <div>
                <strong className="tabular">{critical}</strong>
                <p>{t.pg_dash_critical}</p>
                <em>{t.pg_map_legend_crit}</em>
              </div>
            </article>
            <article className="farm-stat">
              <span className="farm-stat-ico" aria-hidden>▦</span>
              <div>
                <strong>{farm?.sizeLabel || `${farm?.areaSqMetres || '—'} m²`}</strong>
                <p>{t.pg_map_area}</p>
                <em>{farm?.areaSqMetres ? `~ ${Number(farm.areaSqMetres).toLocaleString()} m²` : t.pg_map_coverage}</em>
              </div>
            </article>
            <div className="farm-stat-actions">
              <select
                className="az-select"
                value={anomalyNode}
                onChange={(e) => setAnomalyNode(e.target.value)}
                aria-label={t.pg_map_pick_node}
              >
                {nodes.map((node) => (
                  <option key={node.nodeId} value={node.nodeId}>
                    {t.pg_map_node} {padNode(node.nodeNumber)}
                  </option>
                ))}
              </select>
              <select
                className="az-select"
                value={anomalySensor}
                onChange={(e) => setAnomalySensor(e.target.value)}
                aria-label={t.pg_map_pick_sensor}
              >
                {(gradedSensors.length ? gradedSensors : [{ key: 'nitrogen', label: t.analyze_nitrogen }]).map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary map-anomaly-btn"
                onClick={onAnomaly}
                disabled={!nodes.length}
                aria-busy={busy}
              >
                <AlertTriangle size={16} />
                {busy ? t.pg_export_generating : t.pg_map_simulate}
              </button>
            </div>
          </section>
          {notice && <p className="az-error" role="status">{notice}</p>}

          <div className={`farm-map-stage${selected ? ' has-panel' : ''}`}>
            <section className="farm-canvas" aria-label={t.pg_map_h} data-layer={layer}>
              <div className="farm-canvas-tools">
                <div className="farm-layer-tabs" role="tablist">
                  <button type="button" role="tab" className={layer === 'field' ? 'is-active' : ''} onClick={() => setLayer('field')}>
                    {t.pg_map_tab_field}
                  </button>
                  <button type="button" role="tab" className={layer === 'grid' ? 'is-active' : ''} onClick={() => setLayer('grid')}>
                    {t.pg_map_tab_grid}
                  </button>
                </div>
                <Link to="/app/satellite" className="farm-ghost-btn farm-sat-link">{t.nav_satellite}</Link>
              </div>

              <div className="farm-field">
                <img
                  className="farm-aerial"
                  src="/farm-aerial.png"
                  alt={t.pg_map_h}
                />
                {layer === 'grid' ? <div className="farm-plots" aria-hidden /> : null}

                <div className="farm-plot">
                  {nodes.map((node) => (
                    <button
                      key={node.nodeId}
                      type="button"
                      className={`map-node ${healthClass(node.health)}${selectedId === node.nodeId ? ' is-open' : ''}`}
                      style={{
                        left: `${(node.position?.x ?? 0.5) * 73 + 20}%`,
                        top: `${(node.position?.y ?? 0.5) * 76 + 11}%`,
                      }}
                      onClick={() => { setSelectedId(node.nodeId); setPanelTab('live'); }}
                      aria-label={`${t.pg_map_node} ${padNode(node.nodeNumber)}`}
                    >
                      <span>{padNode(node.nodeNumber)}</span>
                    </button>
                  ))}
                </div>

                <div className="farm-legend">
                  <p><span className="map-dot is-good" /> {t.pg_map_legend_good}</p>
                  <p><span className="map-dot is-watch" /> {t.pg_map_legend_watch}</p>
                  <p><span className="map-dot is-critical" /> {t.pg_map_legend_crit}</p>
                  <p className="farm-legend-note">{t.pg_map_coverage}</p>
                </div>
                <div className="farm-scale" aria-hidden>
                  <i /><i /><i />
                  <span>0</span><span>25 m</span><span>50 m</span>
                </div>
                <span className="farm-north" aria-hidden>N</span>
              </div>
            </section>

            {selected && (
              <aside className="map-panel farm-node-panel" aria-label={`${t.pg_map_node} ${padNode(selected.nodeNumber)}`}>
                <header>
                  <div>
                    <h2>{t.pg_map_node} {padNode(selected.nodeNumber)}</h2>
                    <p className="farm-node-meta">
                      {selected.zone} · {selected.coversSqMetres || 500} m²
                    </p>
                    <p className="farm-node-updated">{t.pg_map_updated}: {formatTime(selected.lastReadingAt, lang)}</p>
                  </div>
                  <div className="farm-node-head-tools">
                    <span className={`farm-pill ${healthClass(selected.health)}`}>
                      {qualityLabel(selected.health, t) || t.pg_map_waiting}
                    </span>
                    <button type="button" className="map-close" onClick={() => setSelectedId(null)} aria-label={t.lp_menu_close}>
                      <X size={18} />
                    </button>
                  </div>
                </header>

                <div className="farm-panel-tabs" role="tablist">
                  {[
                    { id: 'live', label: t.pg_map_live },
                    { id: 'graph', label: t.pg_map_graph },
                    { id: 'details', label: t.pg_map_details },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      className={panelTab === item.id ? 'is-active' : ''}
                      onClick={() => setPanelTab(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {panelTab === 'live' && (
                  <>
                    <ul className="map-sensors farm-sensor-list">
                      {Object.values(selected.sensors || {}).map((item) => {
                        const Icon = SENSOR_ICONS[item.key] || Leaf;
                        return (
                          <li key={item.key} className={healthClass(item.status)}>
                            <span className="farm-sensor-name">
                              <Icon size={14} />
                              {item.label}
                            </span>
                            <strong className="tabular">
                              {item.value}{item.unit ? ` ${item.unit}` : ''}
                            </strong>
                            <em className={`farm-pill ${healthClass(item.status)}`}>{qualityLabel(item.status, t)}</em>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="farm-overall">
                      <span>{t.pg_map_overall}</span>
                      <em className={`farm-pill ${healthClass(selected.health)}`}>{qualityLabel(selected.health, t) || '—'}</em>
                    </div>
                    {criticalReasons.length > 0 && (
                      <p className="farm-crit-note">
                        {criticalReasons.join(', ')} — {t.pg_map_legend_crit}
                      </p>
                    )}
                  </>
                )}

                {panelTab === 'graph' && (
                  <>
                    <div className="map-graph-tools">
                      <select className="az-select" value={sensor} onChange={(e) => setSensor(e.target.value)}>
                        {GRAPH_SENSORS.map((key) => (
                          <option key={key} value={key}>{sensorLabel(key, catalogue, t)}</option>
                        ))}
                      </select>
                      <div className="map-ranges">
                        {RANGES.map((item) => (
                          <button
                            key={item}
                            type="button"
                            className={range === item ? 'is-active' : ''}
                            onClick={() => setRange(item)}
                          >
                            {t[`pg_map_range_${item}`]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="map-chart">
                      {series?.points?.length ? (
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={series.points.map((p) => ({ ...p, t: new Date(p.t).toLocaleString() }))}>
                            <CartesianGrid stroke="rgba(20,28,22,0.08)" />
                            <XAxis dataKey="t" hide />
                            <YAxis width={36} tick={{ fontSize: 10, fill: 'var(--sage)' }} />
                            <Tooltip />
                            <Line type="monotone" dataKey="value" stroke="#0e1a12" strokeWidth={1.6} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="farm-note">{t.pg_map_no_points}</p>
                      )}
                      {series?.aggregation && (
                        <p className="farm-note">{series.aggregation.method}. {series.aggregation.note}</p>
                      )}
                    </div>
                  </>
                )}

                {panelTab === 'details' && (
                  <dl className="rs-conds">
                    <div>
                      <dt>{t.pg_map_zone}</dt>
                      <dd>{selected.zone}</dd>
                    </div>
                    <div>
                      <dt>ID</dt>
                      <dd>{selected.nodeId}</dd>
                    </div>
                    <div>
                      <dt>{t.pg_map_updated}</dt>
                      <dd className="tabular">{formatTime(selected.lastReadingAt, lang)}</dd>
                    </div>
                    <div>
                      <dt>{t.pg_map_anomalies}</dt>
                      <dd className="tabular">{detail?.anomalies?.total ?? 0}</dd>
                    </div>
                    <div>
                      <dt>{t.pg_map_latest}</dt>
                      <dd className="tabular">
                        {detail?.anomalies?.latestAt ? formatTime(detail.anomalies.latestAt, lang) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.pg_map_coverage}</dt>
                      <dd>{selected.coversSqMetres || 500} m²</dd>
                    </div>
                  </dl>
                )}

                <div className="farm-cta-actions">
                  <button type="button" className="btn-secondary" onClick={onRestore} disabled={busy}>
                    <RotateCcw size={14} /> {t.pg_map_restore}
                  </button>
                  <Link to="/app/history" className="btn-secondary">{t.pg_view_history}</Link>
                  <Link to="/app/analyze" className="btn-primary">{t.nav_analyze}</Link>
                </div>
              </aside>
            )}
          </div>

          <footer className="farm-map-foot">
            <div>
              <p className="pg-kicker">{t.pg_map_overview}</p>
              <p>
                {farm?.sizeLabel || t.pg_farm}
                {' · '}
                {nodes.length} {t.pg_map_active}
                {coverage?.unprovisionedNodes ? ` · ${coverage.unprovisionedNodes} ${t.pg_map_unprovisioned}` : ''}
                {' · '}
                {t.pg_map_coverage}
              </p>
            </div>
            <Link to="/app/history" className="btn-secondary">{t.pg_map_all_nodes}</Link>
          </footer>
        </>
      )}
    </div>
  );
}
