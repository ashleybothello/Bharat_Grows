import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import DataBadge from '../../components/DataBadge';
import { useLang } from '../../context/LanguageContext';
import { formatInr } from '../../utils/market';
import { formatDashDate } from './helpers';

export default function MarketOverview({ latest, points, marketError, marketLoading }) {
  const { t, lang } = useLang();

  return (
    <section className="dash-market">
      <header className="dash-panel-head">
        <div>
          <p className="dash-kicker dark">{t.dash_market_intel}</p>
          <h2>{t.lp_market_h2}</h2>
        </div>
        <DataBadge kind={marketError ? 'error' : 'official'} />
      </header>
      <div className="dash-market-grid">
        <div>
          <h3>{t.lp_wheat}</h3>
          {marketLoading && <p className="dash-fine">{t.lp_market_loading}</p>}
          {!marketLoading && marketError && <p className="dash-fine">{t.lp_market_err}</p>}
          {!marketLoading && !marketError && latest && (
            <>
              <p className="dash-price tabular">
                {formatInr(latest.modalPrice)} <span>{t.lp_quintal}</span>
              </p>
              <p className="dash-fine">
                {latest.market ? latest.market : t.dash_latest_price}
                {latest.date ? ` · ${formatDashDate(latest.date, lang)}` : ''}
              </p>
            </>
          )}
          {!marketLoading && !marketError && !latest && (
            <p className="dash-fine">{t.dash_market_empty}</p>
          )}
          <Link to="/app/market" className="dash-text">
            {t.dash_view_market} <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="dash-chart">
          <p className="dash-chart-label">{t.dash_trend}</p>
          {points.length > 1 ? (
            <ResponsiveContainer width="100%" height={148}>
              <AreaChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <Tooltip
                  formatter={(value) => [formatInr(value), t.lp_modal]}
                  labelFormatter={(label) => formatDashDate(label, lang)}
                />
                <Area type="monotone" dataKey="modal" stroke="#2c5a3c" fill="rgba(44,90,60,0.16)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="dash-fine">{marketLoading ? t.lp_market_loading : t.lp_market_chart_empty}</p>
          )}
          <p className="dash-source">{t.lp_market_source}</p>
        </div>
      </div>
    </section>
  );
}
