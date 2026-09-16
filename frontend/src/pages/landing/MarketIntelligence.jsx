import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import DataBadge from '../../components/DataBadge';
import { useLang } from '../../context/LanguageContext';
import {
  fetchMarketCrop,
  fetchMarketTrends,
  formatInr,
  formatMandiDate,
} from '../../utils/market';
import { fadeUp } from './motion';

export default function MarketIntelligence() {
  const reduce = useReducedMotion();
  const { t } = useLang();
  const [latest, setLatest] = useState(null);
  const [points, setPoints] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cropRes, trendRes] = await Promise.all([
          fetchMarketCrop('Wheat'),
          fetchMarketTrends({ commodity: 'Wheat', range: '7d' }),
        ]);
        if (cancelled) return;
        if (!cropRes.ok || !cropRes.data?.success) {
          setError('fail');
          return;
        }
        setLatest(cropRes.data.latest || null);
        if (trendRes.ok && trendRes.data?.success) {
          setPoints(trendRes.data.data || trendRes.data.observations || []);
        }
      } catch {
        if (!cancelled) setError('fail');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="lp-market" id="market">
      <div className="lp-wrap lp-split">
        <motion.div {...fadeUp(reduce)}>
          <h2>{t.lp_market_h2}</h2>
          <p className="lp-lede">
            {t.lp_market_lede}
          </p>
          <Link to="/login" className="lp-text-link">{t.lp_market_link}</Link>
        </motion.div>
        <motion.article className="lp-market-card" {...fadeUp(reduce, 0.08)}>
          <div className="lp-market-top">
            <p className="lp-section-label">{t.lp_market_label}</p>
            <DataBadge kind={error ? 'error' : 'official'} />
          </div>
          <h3>{t.lp_wheat}</h3>
          {loading && <p className="lp-fine">{t.lp_market_loading}</p>}
          {!loading && error && <p className="lp-fine">{t.lp_market_err}</p>}
          {!loading && !error && latest && (
            <>
              <p className="lp-market-price tabular">{formatInr(latest.modalPrice)} <span>{t.lp_quintal}</span></p>
              <p className="lp-fine">
                7D · {latest.market ? `${latest.market}` : t.lp_market_latest}
                {latest.date ? ` · ${formatMandiDate(latest.date)}` : ''}
              </p>
            </>
          )}
          <div className="lp-chart">
            {points.length > 1 ? (
              <ResponsiveContainer width="100%" height={132}>
                <AreaChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <Tooltip
                    formatter={(value) => [formatInr(value), t.lp_modal]}
                    labelFormatter={(label) => formatMandiDate(label)}
                  />
                  <Area type="monotone" dataKey="modal" stroke="#2d5a3a" fill="rgba(45,90,58,0.16)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="lp-fine">{t.lp_market_chart_empty}</p>
            )}
          </div>
          <p className="lp-source">{t.lp_market_source}</p>
        </motion.article>
      </div>
    </section>
  );
}
