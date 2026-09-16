import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import DataBadge from '../components/DataBadge';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { STATES, districtsFor } from '../data/indiaLocations';
import {
  cropMarketPath,
  fetchMarketSummary,
  formatInr,
  formatMandiDate,
  formatPct,
  moveClass,
} from '../utils/market';
import { completeAction, emitPageGone, emitPageReady, setUiContext, subscribeSaathi } from '../utils/saathi/bus';
import './market.css';

const QUICK_CROPS = ['Wheat', 'Onion', 'Potato', 'Tomato', 'Maize', 'Cotton', 'Soyabean'];

export default function MarketForecasting() {
  const { farmer } = useAuth();
  const { t } = useLang();
  const profile = farmer?.profile || {};
  const [query, setQuery] = useState('');
  const [state, setState] = useState(profile.state || '');
  const [district, setDistrict] = useState(profile.district || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  const districts = useMemo(() => districtsFor(state), [state]);
  const primary = profile.primaryCrop || '';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchMarketSummary({ state, district, q: query, pin: primary });
      if (!res.ok || !res.data?.success) {
        setSummary(null);
        setError(res.data?.message || t.pg_mkt_unavail_p);
        return;
      }
      setSummary(res.data);
    } catch {
      setSummary(null);
      setError(t.pg_mkt_unavail_p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, district, query]);

  const crops = useMemo(() => {
    const rows = summary?.commodities || [];
    return [...rows].sort((a, b) => {
      const aYours = primary && a.commodity.toLowerCase() === primary.toLowerCase() ? 0 : 1;
      const bYours = primary && b.commodity.toLowerCase() === primary.toLowerCase() ? 0 : 1;
      if (aYours !== bYours) return aYours - bYours;
      if (a.popular !== b.popular) return a.popular ? -1 : 1;
      return a.commodity.localeCompare(b.commodity);
    });
  }, [summary, primary]);

  const popular = crops.filter((row) => row.popular);
  const lastUpdated = summary?.lastUpdated;

  useEffect(() => {
    setUiContext({
      selectedCrop: query || null,
      selectedMarketState: state || null,
      selectedMarketDistrict: district || null,
    });
  }, [query, state, district]);

  useEffect(() => {
    emitPageReady('market');
    const handle = (action) => {
      if (action.type === 'searchMarketCrop' && action.commodity) setQuery(action.commodity);
      if (action.type === 'filterMarketState' && action.state) {
        setState(action.state);
        setDistrict('');
      }
      if (action.type === 'filterMarketDistrict' && action.district) setDistrict(action.district);
      completeAction(action.id, { ok: true, type: action.type, commodity: action.commodity, state: action.state, district: action.district });
    };
    const unsub = subscribeSaathi(['searchMarketCrop', 'filterMarketState', 'filterMarketDistrict'], handle);
    return () => {
      unsub();
      emitPageGone('market');
    };
  }, []);

  return (
    <div className="farm-page mkt-page">
      <PageHeader
        kicker={t.nav_market}
        title={t.pg_mkt_h}
        lede={t.pg_mkt_p}
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

      <div className="mkt-filters mkt-filters-home">
        <label className="mkt-search">
          {t.pg_mkt_search}
          <span>
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.pg_mkt_placeholder}
              aria-label={t.pg_mkt_search}
            />
          </span>
        </label>
        <label>
          {t.pg_mkt_state}
          <select value={state} onChange={(e) => { setState(e.target.value); setDistrict(''); }} aria-label={t.pg_mkt_state}>
            <option value="">{t.pg_mkt_all_states}</option>
            {STATES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          {t.pg_mkt_district}
          <select value={district} disabled={!state} onChange={(e) => setDistrict(e.target.value)} aria-label={t.pg_mkt_district}>
            <option value="">{t.pg_mkt_all_districts}</option>
            {districts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      {loading && (
        <div className="mkt-overview" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="mkt-skel" />)}
        </div>
      )}

      {!loading && error && (
        <EmptyState
          tone="error"
          icon={TrendingDown}
          title={t.pg_mkt_unavail}
          body={t.pg_mkt_unavail_p}
        >
          <button type="button" className="btn-primary" style={{ marginTop: '0.7rem' }} onClick={load}>
            {t.pg_mkt_retry}
          </button>
        </EmptyState>
      )}

      {!loading && !error && !crops.length && (
        <EmptyState
          icon={TrendingUp}
          title={t.pg_mkt_nomatch}
          body={t.pg_mkt_nomatch_p}
        />
      )}

      {!loading && !error && crops.length > 0 && (
        <>
          {popular.length > 0 || QUICK_CROPS.length > 0 ? (
            <p className="mkt-chip-row" aria-label={t.pg_mkt_popular}>
              {QUICK_CROPS.map((name) => (
                <Link key={name} className="mkt-chip" to={cropMarketPath(name, { state, district })}>
                  {name}
                </Link>
              ))}
              {popular.slice(0, 6).filter((row) => !QUICK_CROPS.some((name) => name.toLowerCase() === row.commodity.toLowerCase())).map((row) => (
                <Link key={row.commodity} className="mkt-chip" to={cropMarketPath(row.commodity, { state, district })}>
                  {row.commodity}
                </Link>
              ))}
            </p>
          ) : null}

          <section>
            <div className="farm-panel-head">
              <h2>{t.pg_mkt_watch}</h2>
              <span className="mkt-source">{t.pg_mkt_latest_label} · {crops.length} {t.pg_mkt_crops_n}</span>
            </div>
            <div className="mkt-overview">
              {crops.map((row) => {
                const href = cropMarketPath(row.commodity, { state, district });
                const pct = formatPct(row.changePercent);
                return (
                  <motion.div key={row.commodity} whileHover={{ y: -3 }} transition={{ duration: 0.18 }}>
                    <Link to={href} className="mkt-card">
                      <div className="mkt-card-kicker">
                        <span>{row.market}</span>
                        {primary && row.commodity.toLowerCase() === primary.toLowerCase() ? (
                          <span className="mkt-yours">{t.pg_mkt_yours}</span>
                        ) : row.popular ? (
                          <span>{t.pg_mkt_popular}</span>
                        ) : null}
                      </div>
                      <h3>{row.commodity}</h3>
                      <div className="mkt-price">{formatInr(row.modalPrice)}</div>
                      <div className="mkt-unit">{t.pg_mkt_per_q} · {formatMandiDate(row.date)}</div>
                      <div className={`mkt-move ${moveClass(row.changePercent)}`}>
                        {pct ? `${pct} ${t.pg_mkt_vs}` : t.pg_mkt_latest_label}
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <p className="mkt-source">
        {t.pg_mkt_source}
        {lastUpdated ? ` · ${formatMandiDate(lastUpdated)}` : ''}
      </p>
    </div>
  );
}
