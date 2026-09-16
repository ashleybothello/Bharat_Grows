import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AlertTriangle, Calendar, FlaskConical, Radio } from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useLang } from '../context/LanguageContext';
import { API_URL } from '../utils/api';
import {
  fetchAnomalies, fetchNodes, fetchTelemetryHistory, fetchTelemetryTrends, telemetryErrorMessage,
} from '../utils/telemetry';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import DataBadge from '../components/DataBadge';
import { qualityLabel, cropLabel, cropsOf, formatDashDate, formatDateTime } from './dashboard/helpers';
import { completeAction, emitPageGone, emitPageReady, sleep, subscribeSaathi } from '../utils/saathi/bus';

const RANGES = ['1d', '1w', '1m', '1y'];
const GRAPH_SENSORS = [
  'nitrogen', 'phosphorus', 'potassium', 'soil_moisture',
  'temperature', 'humidity', 'light', 'rain', 'water_level',
];
const FLAT_SENSORS = [
  'nitrogen', 'phosphorus', 'potassium', 'soil_moisture',
  'temperature', 'humidity', 'light', 'rain', 'water_level', 'flame', 'pir',
];

const History = () => {
  const [tab, setTab] = useState('analyses');
  const [history, setHistory] = useState([]);
  const [readings, setReadings] = useState({ rows: [], total: 0 });
  const [anomalies, setAnomalies] = useState({ rows: [], total: 0 });
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [range, setRange] = useState('1d');
  const [sensor, setSensor] = useState('nitrogen');
  const [series, setSeries] = useState(null);
  const { t, lang } = useLang();
  const histRef = useRef({});
  histRef.current = { nodes };

  useEffect(() => {
    emitPageReady('history');
    const handle = async (action) => {
      if (action.type === 'selectHistoryNode' || action.type === 'showNodeHistory') {
        const started = Date.now();
        while (!histRef.current.nodes?.length && Date.now() - started < 8000) {
          await sleep(100);
        }
        const node = histRef.current.nodes.find((n) => Number(n.nodeNumber) === Number(action.nodeNumber));
        if (!node) {
          completeAction(action.id, { ok: false, type: action.type, error: 'missing_node' });
          return;
        }
        setTab('readings');
        setNodeId(node.nodeId);
        completeAction(action.id, { ok: true, type: action.type, nodeId: node.nodeId, nodeNumber: node.nodeNumber });
        return;
      }
      if (action.type === 'selectHistoryRange' || action.type === 'showHistoryGraph') {
        setTab('readings');
        if (action.range) setRange(action.range);
        if (action.nodeNumber) {
          const node = histRef.current.nodes.find((n) => Number(n.nodeNumber) === Number(action.nodeNumber));
          if (node) setNodeId(node.nodeId);
        }
        completeAction(action.id, { ok: true, type: action.type, range: action.range || '1d' });
      }
    };
    const unsub = subscribeSaathi(['selectHistoryNode', 'selectHistoryRange', 'showHistoryGraph', 'showNodeHistory'], handle);
    return () => {
      unsub();
      emitPageGone('history');
    };
  }, []);

  const load = async () => {
    setError('');
    try {
      const [analyses, telemetry, events, pack] = await Promise.allSettled([
        axios.get(`${API_URL}/history`),
        fetchTelemetryHistory({ limit: 40, nodeId: nodeId || undefined }),
        fetchAnomalies({ limit: 60 }),
        fetchNodes(),
      ]);
      if (analyses.status === 'fulfilled' && Array.isArray(analyses.value.data)) {
        setHistory(analyses.value.data);
      }
      if (telemetry.status === 'fulfilled') setReadings(telemetry.value);
      if (events.status === 'fulfilled') setAnomalies(events.value);
      if (pack.status === 'fulfilled') setNodes(pack.value.nodes || []);
      if (analyses.status === 'rejected' && telemetry.status === 'rejected') {
        setError(telemetryErrorMessage(telemetry.reason, t));
      }
    } catch {
      setError(t.pg_hist_fail_p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
    // nodeId is included so readings refresh when the node filter changes.
  }, [nodeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const trend = await fetchTelemetryTrends({
          sensor,
          range,
          nodeId: nodeId || undefined,
        });
        if (!cancelled) setSeries(trend);
      } catch {
        if (!cancelled) setSeries(null);
      }
    })();
    return () => { cancelled = true; };
  }, [sensor, range, nodeId, readings.total]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => {
      const crops = (item.recommended_crops || []).join(' ').toLowerCase();
      const quality = String(item.soil_quality || '').toLowerCase();
      return crops.includes(q) || quality.includes(q);
    });
  }, [history, query]);

  const sensorRows = useMemo(() => {
    const out = [];
    for (const row of readings.rows || []) {
      for (const key of FLAT_SENSORS) {
        if (row[key] == null) continue;
        const graded = row.evaluation?.sensors?.[key];
        out.push({
          id: `${row.id}-${key}`,
          at: row.recorded_at,
          node: row.node_number || row.node_id,
          sensor: graded?.label || key,
          value: graded?.value ?? row[key],
          unit: graded?.unit || '',
          status: graded?.status || (key === 'rain' ? 'INFORMATIONAL' : row.evaluation?.health || '—'),
        });
      }
    }
    return out;
  }, [readings.rows]);

  const criticalAlerts = useMemo(
    () => (anomalies.rows || []).filter((row) => row.severity === 'CRITICAL'),
    [anomalies.rows],
  );

  const tabs = [
    { id: 'analyses', label: t.pg_hist_tab_analyses },
    { id: 'readings', label: t.pg_hist_tab_readings },
    { id: 'nodes', label: t.pg_hist_tab_nodes },
    { id: 'anomalies', label: t.pg_hist_tab_anomalies },
    { id: 'alerts', label: t.pg_hist_tab_alerts },
  ];

  return (
    <div className="farm-page">
      <PageHeader
        kicker={t.nav_history}
        title={t.history_title}
        lede={t.history_subtitle}
        tools={(
          <>
            <DataBadge kind="demo" />
            {tab === 'analyses' && history.length > 0 ? (
              <input
                className="hist-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.pg_hist_search}
                aria-label={t.pg_hist_search}
              />
            ) : null}
          </>
        )}
      />

      <div className="hist-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={tab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="journal" aria-busy="true">
          <div className="skel" />
          <div className="skel" />
        </div>
      )}

      {!loading && error && tab === 'analyses' && (
        <EmptyState icon={Calendar} title={t.pg_hist_fail} body={error} tone="waiting">
          <button type="button" className="btn-primary" onClick={load}>{t.pg_hist_retry}</button>
        </EmptyState>
      )}

      {!loading && tab === 'analyses' && !error && history.length === 0 && (
        <EmptyState icon={FlaskConical} title={t.pg_hist_none} body={t.history_empty}>
          <Link to="/app/analyze" className="btn-primary">{t.pg_hist_first}</Link>
        </EmptyState>
      )}

      {!loading && tab === 'analyses' && rows.length > 0 && (
        <div className="journal">
          {rows.map((item) => {
            const crops = cropsOf(item);
            return (
              <article key={item.prediction_id}>
                <time dateTime={item.created_at}>
                  {formatDashDate(item.created_at, lang) || formatDateTime(item.created_at, lang)}
                </time>
                <div>
                  <h3>
                    {crops.length
                      ? crops.map((crop) => cropLabel(crop, t)).join(', ')
                      : t.nav_analyze}
                  </h3>
                  <div className="tabular">
                    <span>N {item.n}</span>
                    <span>P {item.p}</span>
                    <span>K {item.k}</span>
                    <span>pH {item.ph}</span>
                  </div>
                </div>
                <span className={`quality-pill is-${String(item.soil_quality || '').toLowerCase()}`}>
                  {qualityLabel(item.soil_quality, t)}
                </span>
              </article>
            );
          })}
        </div>
      )}

      {!loading && (tab === 'readings' || tab === 'nodes') && (
        <section className="az-group">
          <h2>{t.pg_hist_graph}</h2>
          <div className="map-graph-tools">
            <select className="az-select" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
              <option value="">{t.pg_hist_node_all}</option>
              {nodes.map((node) => (
                <option key={node.nodeId} value={node.nodeId}>
                  {t.pg_hist_node} {node.nodeNumber} · {node.zone}
                </option>
              ))}
            </select>
            <select className="az-select" value={sensor} onChange={(e) => setSensor(e.target.value)}>
              {GRAPH_SENSORS.map((key) => (
                <option key={key} value={key}>
                  {{
                    nitrogen: t.analyze_nitrogen,
                    phosphorus: t.analyze_phosphorus,
                    potassium: t.analyze_potassium,
                    soil_moisture: t.analyze_moisture,
                    temperature: t.analyze_temperature,
                    humidity: t.analyze_humidity,
                    light: t.pg_sensor_light,
                    rain: t.analyze_rainfall,
                    water_level: t.pg_sensor_water,
                  }[key] || key}
                </option>
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
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={series.points.map((p) => ({ ...p, t: formatDateTime(p.t, lang) }))}>
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
        </section>
      )}

      {!loading && tab === 'readings' && (
        sensorRows.length ? (
          <div className="journal">
            {sensorRows.map((row) => (
              <article key={row.id} className={row.status === 'CRITICAL' ? 'is-critical' : ''}>
                <time dateTime={row.at}>{formatDateTime(row.at, lang)}</time>
                <div>
                  <h3>{t.pg_hist_node} {row.node} · {row.sensor}</h3>
                  <div className="tabular">
                    <span>{row.value}{row.unit ? ` ${row.unit}` : ''}</span>
                    <span>{qualityLabel(row.status, t)}</span>
                    {row.status === 'CRITICAL' ? <span>{t.pg_hist_anomaly_flag}</span> : null}
                  </div>
                </div>
                <span className={`quality-pill is-${String(row.status || '').toLowerCase()}`}>
                  {qualityLabel(row.status, t)}
                </span>
              </article>
            ))}
            {readings.total > readings.rows.length && (
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  try {
                    const next = await fetchTelemetryHistory({
                      limit: 40,
                      offset: readings.rows.length,
                      nodeId: nodeId || undefined,
                    });
                    setReadings({
                      rows: [...readings.rows, ...(next.rows || [])],
                      total: next.total,
                    });
                  } catch (err) {
                    setError(telemetryErrorMessage(err, t));
                  }
                }}
              >
                {t.pg_hist_more} ({readings.rows.length}/{readings.total})
              </button>
            )}
          </div>
        ) : (
          <EmptyState icon={Radio} title={t.pg_map_waiting} body={t.pg_map_none_p} />
        )
      )}

      {!loading && tab === 'nodes' && (
        nodes.length ? (
          <div className="journal">
            {nodes.map((node) => (
              <article key={node.nodeId} className={node.health === 'CRITICAL' ? 'is-critical' : ''}>
                <time dateTime={node.lastReadingAt || undefined}>
                  {node.lastReadingAt ? formatDateTime(node.lastReadingAt, lang) : t.pg_map_waiting}
                </time>
                <div>
                  <h3>{node.nodeId} · {node.zone}</h3>
                  <div className="tabular">
                    <span>N {node.sensors?.nitrogen?.value ?? '—'}</span>
                    <span>P {node.sensors?.phosphorus?.value ?? '—'}</span>
                    <span>K {node.sensors?.potassium?.value ?? '—'}</span>
                    <span>{node.sensors?.soil_moisture?.value ?? '—'}%</span>
                  </div>
                </div>
                <span className={`quality-pill is-${String(node.health || '').toLowerCase()}`}>
                  {node.health || '—'}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={Radio} title={t.pg_map_none} body={t.pg_map_none_p} />
        )
      )}

      {!loading && tab === 'anomalies' && (
        anomalies.rows?.length ? (
          <div className="journal">
            {anomalies.rows.map((row) => (
              <article key={row.id} className={row.severity === 'CRITICAL' ? 'is-critical' : ''}>
                <time dateTime={row.detected_at}>{formatDateTime(row.detected_at, lang)}</time>
                <div>
                  <h3>
                    {t.pg_hist_node} {row.node_number || row.node_id} · {t.pg_hist_sensor} {row.sensor}
                  </h3>
                  <div className="tabular">
                    <span>{row.value}</span>
                    <span>{qualityLabel(row.severity, t)}</span>
                    {row.email_sent ? <span>email</span> : null}
                    {row.sms_sent ? <span>sms</span> : null}
                  </div>
                  <p className="farm-note">{row.message}</p>
                </div>
                <AlertTriangle size={18} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={AlertTriangle} title={t.pg_hist_tab_anomalies} body={t.pg_map_no_points} />
        )
      )}

      {!loading && tab === 'alerts' && (
        criticalAlerts.length ? (
          <div className="journal">
            {criticalAlerts.map((row) => (
              <article key={row.id} className="is-critical">
                <time dateTime={row.detected_at}>{formatDateTime(row.detected_at, lang)}</time>
                <div>
                  <h3>
                    {t.pg_hist_node} {row.node_number || row.node_id} · {row.sensor}
                  </h3>
                  <div className="tabular">
                    <span>{row.value}</span>
                    <span>{t.health_critical}</span>
                    <span>{row.email_sent ? t.pg_hist_email_sent : t.pg_hist_email_pending}</span>
                    <span>{row.sms_sent ? t.pg_hist_sms_sent : t.pg_hist_sms_pending}</span>
                  </div>
                  <p className="farm-note">{row.message}</p>
                </div>
                <AlertTriangle size={18} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={AlertTriangle} title={t.pg_hist_tab_alerts} body={t.pg_hist_alerts_empty} />
        )
      )}
    </div>
  );
};

export default History;
