import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import Metric from './Metric';
import { fade, farmerPlace, greetingKey } from './helpers';

export default function DashboardHeader({ reduce, liveNode, nodeCounts }) {
  const { farmer = {} } = useAuth();
  const { t } = useLang();
  const name = farmer.name || farmer.profile?.fullName || t.review_farmer;
  const place = farmerPlace(farmer);

  return (
    <motion.header className="dash-hero" {...fade(reduce)}>
      <div className="dash-hero-top">
        <div>
          <p className="dash-kicker">{t[greetingKey()]}, {name}</p>
          <h1>{t.dash_command}</h1>
          {place ? <p className="dash-place">{place}</p> : null}
        </div>
        <div className="dash-hero-hw">
          <p className="dash-kicker">{t.dash_hardware}</p>
          <p className="dash-hw-status">
            <span className="dash-dot" />
            {t.dash_waiting_hw}
          </p>
          <p className="dash-fine" style={{ color: 'rgba(246,241,231,0.7)' }}>{t.pg_dash_sim}</p>
          <dl>
            <div>
              <dt>{t.dash_field_device}</dt>
              <dd>{t.dash_unpaired}</dd>
            </div>
            <div>
              <dt>{t.dash_last_sync}</dt>
              <dd className="tabular">{liveNode?.lastReadingAt ? new Date(liveNode.lastReadingAt).toLocaleTimeString() : '—'}</dd>
            </div>
            <div>
              <dt>{t.pg_dash_nodes}</dt>
              <dd className="tabular">
                {nodeCounts?.total
                  ? `${nodeCounts.healthy}/${nodeCounts.total} ${t.pg_dash_healthy}`
                  : '—'}
              </dd>
            </div>
          </dl>
          <Link to="/beta" className="dash-link-light">
            {t.dash_connect_hw} <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>

      <dl className="dash-strip dash-strip-nodes">
        <Metric label={t.pg_dash_total} value={nodeCounts?.total ?? 0} />
        <Metric label={t.pg_dash_healthy} value={nodeCounts?.healthy ?? 0} />
        <Metric label={t.pg_dash_warning} value={nodeCounts?.warning ?? 0} />
        <Metric label={t.pg_dash_critical} value={nodeCounts?.critical ?? 0} />
      </dl>
    </motion.header>
  );
}
