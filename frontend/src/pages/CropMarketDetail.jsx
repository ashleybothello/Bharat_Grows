import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, RefreshCw, TrendingDown } from 'lucide-react';
import DataBadge from '../components/DataBadge';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';
import { STATES, districtsFor } from '../data/indiaLocations';
import {
  fetchMarketCrop,
  fetchMarketTrends,
  formatChange,
  formatInr,
  formatMandiDate,
  formatPct,
  moveClass,
} from '../utils/market';
import './market.css';

const RANGES = [
  { id: '1d', label: '1D' },
  { id: '7d', label: '7D' },
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
];

function signalClass(code) {
  if (code === 'ABOVE_USUAL') return 'above';
  if (code === 'BELOW_USUAL') return 'below';
  if (code === 'NORMAL') return 'normal';
  return '';
}

export default function CropMarketDetail() {
  const { t } = useLang();
  const { commodity: rawCommodity } = useParams();
  const commodity = decodeURIComponent(rawCommodity || '');
  const [params, setParams] = useSearchParams();
  const state = params.get('state') || '';
  const district = params.get('district') || '';
  const market = params.get('market') || '';
  const range = (params.get('range') || '7d').toLowerCase();
  const sort = params.get('sort') || 'highest';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);

  const districts = useMemo(() => districtsFor(state), [state]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'state') next.delete('district');
    if (key === 'state' || key === 'district') next.delete('market');
    setParams(next, { replace: true });
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [cropRes, trendRes] = await Promise.all([
        fetchMarketCrop(commodity, { state, district, market, sort }),
        fetchMarketTrends({ commodity, state, district, market, range }),
      ]);
      if (!cropRes.ok || !cropRes.data?.success) {
        setDetail(null);
        setError(cropRes.data?.message || t.pg_mkt_unavail_p);
        return;
      }
      if (!trendRes.ok || !trendRes.data?.success) {
        setDetail({
          ...cropRes.data,
          observations: [],
          data: [],
          chart: [],
        });
        setError(trendRes.data?.message || t.pg_mkt_unavail_p);
        return;
      }
      const points = trendRes.data.data || trendRes.data.observations || [];
      setDetail({
        ...cropRes.data,
        ...trendRes.data,
        latest: cropRes.data.latest,
        markets: cropRes.data.markets,
        observations: points,
        data: points,
        chart: points,
        metrics: trendRes.data.metrics,
        ranges: trendRes.data.ranges,
        seriesLabel: trendRes.data.seriesLabel,
        signal: trendRes.data.intelligence?.signal || trendRes.data.signal || null,
      });
    } catch {
      setDetail(null);
      setError(t.pg_mkt_unavail_p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commodity, state, district, market, range, sort]);

  const latest = detail?.latest;
  const metrics = detail?.metrics;
  const signal = detail?.signal;
  const ranges = detail?.ranges || {};
  const chart = detail?.data || detail?.observations || [];
  const observations = chart;
  const selectedRange = ranges[range] || { enabled: observations.length >= 1 };
  const mandis = useMemo(() => {
    const rows = [...(detail?.markets || [])];
    rows.sort((a, b) => (sort === 'lowest' ? (a.modalPrice || 0) - (b.modalPrice || 0) : (b.modalPrice || 0) - (a.modalPrice || 0)));
    return rows;
  }, [detail, sort]);

  return (
    <div className="farm-page mkt-page mkt-detail">
      <Link to="/app/market" className="mkt-back">
        <ArrowLeft size={16} /> {t.pg_mkt_back}
      </Link>
      <PageHeader
        kicker={t.nav_market}
        title={commodity}
        lede={t.pg_mkt_detail_p}
        tools={(
          <>
            <DataBadge kind={error ? 'error' : 'official'} />
            <button type="button" className="farm-ghost-btn" onClick={load} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              {loading ? t.pg_mkt_updating : t.pg_mkt_retry}
            </button>
          </>
        )}
      />

      <div className="mkt-filters">
        <label>
          {t.pg_mkt_state}
          <select value={state} onChange={(e) => setFilter('state', e.target.value)} aria-label={t.pg_mkt_state}>
            <option value="">{t.pg_mkt_all_states}</option>
            {STATES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          {t.pg_mkt_district}
          <select value={district} disabled={!state} onChange={(e) => setFilter('district', e.target.value)} aria-label={t.pg_mkt_district}>
            <option value="">{t.pg_mkt_all_districts}</option>
            {districts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          {t.pg_mkt_mandi}
          <select value={market} onChange={(e) => setFilter('market', e.target.value)} aria-label={t.pg_mkt_mandi}>
            <option value="">{t.pg_mkt_all_mandis}</option>
            {mandis.map((row) => (
              <option key={`${row.market}-${row.variety}`} value={row.market}>{row.market}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <div className="mkt-skel" style={{ minHeight: 220 }} aria-hidden="true" />}

      {!loading && error && (
        <EmptyState
          tone="error"
          icon={TrendingDown}
          title={t.pg_mkt_unavail}
          body={t.pg_mkt_unavail_p}
        >
          <button type="button" className="btn-primary" style={{ marginTop: '0.7rem' }} onClick={load}>{t.pg_mkt_retry}</button>
        </EmptyState>
      )}

      {!loading && !error && latest && (
        <>
          <section className="mkt-hero">
            <article className="mkt-quote">
              <p className="mkt-kicker">{t.pg_mkt_latest_modal}</p>
              <p className="mkt-price mkt-price-xl">{formatInr(latest.modalPrice)}</p>
              <p className="mkt-unit">{t.pg_mkt_per_q}</p>
              <p className={`mkt-move ${moveClass(metrics?.changePercent)}`}>
                {formatPct(metrics?.changePercent)
                  ? `${formatPct(metrics.changePercent)} ${t.pg_mkt_vs_obs}`
                  : t.pg_mkt_one_obs}
              </p>
              <p className="farm-note">
                {latest.market}{latest.district ? `, ${latest.district}` : ''}{latest.state ? `, ${latest.state}` : ''}
                {latest.variety ? ` · ${latest.variety}` : ''}
                {latest.grade ? ` · ${latest.grade}` : ''}
                {' · '}{formatMandiDate(latest.date)}
              </p>
            </article>

            {signal ? (
              <article className={`mkt-signal ${signalClass(signal.code)}`}>
                <p className="mkt-kicker" style={{ color: 'inherit', opacity: 0.7 }}>{t.pg_mkt_signal}</p>
                <h2>{signal.label}</h2>
                <p>{signal.detail}</p>
              </article>
            ) : (
              <article className="mkt-signal">
                <p className="mkt-kicker" style={{ color: 'inherit', opacity: 0.7 }}>{t.pg_mkt_signal}</p>
                <h2>{t.pg_mkt_signal_wait}</h2>
                <p>{t.pg_mkt_signal_wait_p}</p>
              </article>
            )}
          </section>

          <section className="az-group">
            <div className="farm-panel-head">
              <div>
                <h2>{t.pg_mkt_chart}</h2>
                <p className="farm-note">{detail.seriesLabel}. {t.pg_mkt_missing}</p>
              </div>
              <div className="mkt-sort" role="group" aria-label={t.pg_mkt_range}>
                {RANGES.map((item) => {
                  const meta = ranges[item.id];
                  const dimmed = meta?.enabled === false && item.id !== '1d' && item.id !== '7d';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={range === item.id ? 'is-on' : ''}
                      aria-pressed={range === item.id}
                      title={meta?.reason || ''}
                      onClick={() => setFilter('range', item.id)}
                      style={dimmed ? { opacity: 0.45 } : undefined}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {!selectedRange.enabled && range !== '1d' && range !== '7d' ? (
              <p className="farm-note">{t.pg_mkt_hist_wait}</p>
            ) : observations.length >= 2 ? (
              <div className="mkt-chart">
                <ResponsiveContainer width="100%" height={280} minWidth={0}>
                  <AreaChart data={chart}>
                    <defs>
                      <linearGradient id="mandiFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2c5a3c" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#2c5a3c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,22,15,0.08)" />
                    <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} style={{ fontSize: 12 }} />
                    <YAxis domain={['auto', 'auto']} tickFormatter={(v) => `₹${v}`} style={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value, name) => [value == null ? t.pg_mkt_no_obs : formatInr(value), name]}
                      labelFormatter={(label) => formatMandiDate(label)}
                    />
                    <Area type="linear" dataKey="min" stroke="#8aa58f" strokeWidth={1.5} fill="none" name={t.pg_mkt_min} connectNulls={false} />
                    <Area type="linear" dataKey="modal" stroke="#0e1a12" strokeWidth={2.2} fill="url(#mandiFill)" name={t.pg_mkt_modal} connectNulls={false} />
                    <Area type="linear" dataKey="max" stroke="#8a5a38" strokeWidth={1.5} fill="none" name={t.pg_mkt_max} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="farm-note">
                {observations.length === 1 ? t.pg_mkt_one_line : t.pg_mkt_hist_wait}
              </p>
            )}
            <p className="farm-note">
              {observations.length
                ? `${observations.length} ${t.pg_obs_count}`
                : t.pg_mkt_obs_none}
            </p>
          </section>

          <section className="az-group">
            <h2>{t.pg_mkt_stats}</h2>
            <div className="mkt-stat-row mkt-stat-row-8">
              <div className="mkt-stat"><span>{t.pg_mkt_latest}</span><strong>{formatInr(metrics?.latest)}</strong></div>
              <div className="mkt-stat"><span>{t.pg_mkt_prev}</span><strong>{formatInr(metrics?.previous)}</strong></div>
              <div className="mkt-stat"><span>{t.pg_mkt_change}</span><strong className={moveClass(metrics?.change)}>{formatChange(metrics?.change) || '—'}</strong></div>
              <div className="mkt-stat"><span>{t.pg_mkt_change_pct}</span><strong className={moveClass(metrics?.changePercent)}>{formatPct(metrics?.changePercent) || '—'}</strong></div>
              <div className="mkt-stat"><span>{t.pg_mkt_avg}</span><strong>{formatInr(metrics?.average)}</strong></div>
              <div className="mkt-stat"><span>{t.pg_mkt_high}</span><strong>{formatInr(metrics?.high)}</strong></div>
              <div className="mkt-stat"><span>{t.pg_mkt_low}</span><strong>{formatInr(metrics?.low)}</strong></div>
              <div className="mkt-stat"><span>{t.pg_mkt_mandis}</span><strong>{metrics?.mandiCount ?? '—'}</strong></div>
            </div>
          </section>

          <section className="az-group">
            <div className="farm-panel-head">
              <h2>{t.pg_mkt_compare}</h2>
              <div className="mkt-sort">
                <button type="button" className={sort === 'highest' ? 'is-on' : ''} onClick={() => setFilter('sort', 'highest')}>{t.pg_mkt_highest}</button>
                <button type="button" className={sort === 'lowest' ? 'is-on' : ''} onClick={() => setFilter('sort', 'lowest')}>{t.pg_mkt_lowest}</button>
              </div>
            </div>
            {mandis.length ? (
              <div className="mkt-table-wrap">
                <table className="mkt-table">
                  <thead>
                    <tr>
                      <th>{t.pg_mkt_mandi}</th>
                      <th>{t.pg_mkt_district}</th>
                      <th>{t.pg_mkt_variety}</th>
                      <th>{t.pg_mkt_min}</th>
                      <th>{t.pg_mkt_modal}</th>
                      <th>{t.pg_mkt_max}</th>
                      <th>{t.pg_mkt_date}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mandis.map((row) => (
                      <tr key={`${row.market}-${row.variety}-${row.grade || ''}`} className={row.highlight ? `is-${row.highlight}` : ''}>
                        <td>
                          <button type="button" className="farm-ghost-btn" onClick={() => setFilter('market', row.market)}>{row.market}</button>
                          {row.highlight === 'highest' ? <span className="mkt-flag">{t.pg_mkt_flag_hi}</span> : null}
                          {row.highlight === 'lowest' ? <span className="mkt-flag">{t.pg_mkt_flag_lo}</span> : null}
                        </td>
                        <td>{row.district || '—'}</td>
                        <td>{row.variety}{row.grade ? ` · ${row.grade}` : ''}</td>
                        <td>{formatInr(row.minPrice)}</td>
                        <td>{formatInr(row.modalPrice)}</td>
                        <td>{formatInr(row.maxPrice)}</td>
                        <td>{formatMandiDate(row.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="farm-note">{t.pg_mkt_no_compare}</p>
            )}
          </section>
        </>
      )}

      <p className="mkt-source">
        {t.pg_mkt_source_foot}
        {' '}<Link to="/app/market">{t.pg_mkt_back}</Link>
      </p>
    </div>
  );
}
