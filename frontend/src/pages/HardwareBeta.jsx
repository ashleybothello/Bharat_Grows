import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowUpRight, CloudRain, Cpu, Droplets, Flame, Leaf,
  Radio, Sun, Thermometer, Waves,
} from 'lucide-react';
import BrandMark from '../components/BrandMark';
import LanguageSelect from '../components/LanguageSelect';
import FieldFilm from '../components/FieldFilm';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { fetchHardwareLive, telemetryErrorMessage } from '../utils/telemetry';
import { localeFor } from '../utils/i18n-catalog';
import { qualityLabel } from './dashboard/helpers';

const POLL_MS = 5000;
const SENSOR_ORDER = [
  'nitrogen', 'phosphorus', 'potassium', 'soil_moisture',
  'temperature', 'humidity', 'light', 'rain', 'water_level',
  'flame', 'pir',
];
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
const SENSOR_I18N = {
  nitrogen: 'analyze_nitrogen',
  phosphorus: 'analyze_phosphorus',
  potassium: 'analyze_potassium',
  soil_moisture: 'analyze_moisture',
  temperature: 'analyze_temperature',
  humidity: 'analyze_humidity',
  light: 'pg_sensor_light',
  rain: 'pg_hw_rain',
  water_level: 'pg_sensor_water',
  flame: 'pg_hw_flame',
  pir: 'pg_hw_pir',
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

function formatValue(sensor) {
  if (sensor?.value == null || Number.isNaN(Number(sensor.value))) return '—';
  const n = Number(sensor.value);
  const text = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  return sensor.unit ? `${text} ${sensor.unit}` : text;
}

function sensorLabel(key, sensor, t) {
  const i18nKey = SENSOR_I18N[key];
  return (i18nKey && t[i18nKey]) || sensor?.label || key;
}

const HardwareBeta = () => {
  const { t, lang } = useLang();
  const { isAuthed } = useAuth();
  const analyzeTo = isAuthed ? '/app/analyze' : '/login';
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');
  const [tickAt, setTickAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchHardwareLive();
      setLive(data);
      setError('');
      setTickAt(new Date().toISOString());
    } catch (err) {
      setError(telemetryErrorMessage(err, t));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await load();
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [load]);

  const devices = live?.devices || [];
  const onlineCount = devices.filter((d) => d.online).length;
  const pollMs = live?.intervalMs || POLL_MS;

  return (
    <div className="hw-beta">
      <nav className="hw-beta-nav" aria-label={t.lp_nav_primary}>
        <div className="hw-beta-nav-inner">
          <Link to="/" aria-label={t.lp_brand}>
            <BrandMark size="sm" inverse />
          </Link>
          <div className="app-nav-tools">
            <LanguageSelect variant="inverse" />
            <Link to="/" className="app-nav-link" style={{ minHeight: 44 }}>
              {t.pg_hw_software}
            </Link>
            <Link to={analyzeTo} className="btn-primary" style={{ minHeight: 36, padding: '0.35rem 0.85rem', background: '#f6f1e7', color: 'var(--forest)' }}>
              {t.pg_hw_analyze} <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      <main className="hw-beta-main">
        <ol className="hw-path">
          <li>{t.pg_hw_path_field}</li>
          <li>{t.pg_hw_path_sensors}</li>
          <li>{t.pg_hw_path_data}</li>
          <li>{t.pg_hw_path_bg}</li>
          <li>{t.pg_hw_path_action}</li>
        </ol>

        <section className="hw-hero">
          <div>
            <p className="pg-kicker" style={{ color: 'rgba(246,241,231,0.5)' }}>{t.pg_hw_live}</p>
            <h1>{t.pg_hw_h}</h1>
            <p>{t.pg_hw_p}</p>
            <p className="hw-live-note">{t.pg_hw_live_p}</p>
            <div className="farm-cta-actions" style={{ marginTop: '1.1rem' }}>
              <Link to={analyzeTo} className="btn-primary" style={{ background: '#f6f1e7', color: 'var(--forest)' }}>
                {t.pg_hw_analyze} <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          <dl className="hw-status">
            <dt>{t.pg_hw_device}</dt>
            <dd>
              <span className={`hw-live-dot ${onlineCount ? 'is-on' : ''}`} />
              {onlineCount ? t.pg_hw_online : t.pg_hw_unpaired}
              {devices.length ? ` · ${onlineCount}/${devices.length}` : ''}
            </dd>
            <dt>{t.pg_hw_sync}</dt>
            <dd>{formatTime(tickAt || devices[0]?.lastSeenAt, lang)}</dd>
            <dt>{t.pg_hw_source}</dt>
            <dd>{devices.length ? devices.map((d) => d.deviceId).join(' · ') : '—'}</dd>
            <dt>{t.pg_hw_refresh}</dt>
            <dd>{Math.round(pollMs / 1000)}s</dd>
          </dl>
        </section>

        {error && <p className="farm-note hw-live-error" role="alert">{error}</p>}

        {!devices.length && !error && (
          <p className="farm-note" style={{ color: 'var(--sage)' }}>{t.pg_hw_empty}</p>
        )}

        <section className="hw-live-grid" aria-live="polite">
          {devices.map((device) => {
            const sensors = SENSOR_ORDER
              .map((key) => device.sensors?.[key])
              .filter(Boolean);
            return (
              <article key={device.deviceId} className="hw-live-card">
                <header className="hw-live-head">
                  <div>
                    <p className="pg-kicker">{t.pg_hw_source}</p>
                    <h2>{t.format('pg_hw_esp', { n: device.deviceId })}</h2>
                  </div>
                  <span className={`farm-pill ${device.online ? 'is-good' : 'is-unknown'}`}>
                    <Radio size={12} /> {device.online ? t.pg_hw_online : t.pg_hw_offline}
                  </span>
                </header>
                <div className="farm-overall">
                  <span>{qualityLabel(device.health, t) || t.pg_hw_waiting}</span>
                  <em className={`farm-pill ${healthClass(device.health)}`}>{device.health || '—'}</em>
                </div>
                <p className="hw-live-stamp">
                  {t.pg_hw_sync}: {formatTime(device.packetAt || device.lastSeenAt, lang)}
                </p>
                <ul className="farm-sensor-list">
                  {sensors.map((sensor) => {
                    const Icon = SENSOR_ICONS[sensor.key] || Cpu;
                    return (
                      <li key={sensor.key}>
                        <span className="farm-sensor-name">
                          <Icon size={14} /> {sensorLabel(sensor.key, sensor, t)}
                        </span>
                        <strong>{formatValue(sensor)}</strong>
                        <em className={`farm-pill ${healthClass(sensor.status)}`}>
                          {sensor.status === 'INFORMATIONAL' ? '—' : (qualityLabel(sensor.status, t) || '—')}
                        </em>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </section>

        <p className="farm-note" style={{ color: 'var(--sage)', maxWidth: '40rem' }}>
          {t.pg_hw_saved}
        </p>
        <p className="farm-note" style={{ color: 'var(--sage)', maxWidth: '40rem' }}>
          {t.pg_hw_sim_note}
        </p>
        {isAuthed && (
          <p className="farm-note">
            <Link to="/app/iot" style={{ color: 'var(--forest)' }}>{t.nav_iot}</Link>
          </p>
        )}

        <FieldFilm className="hw-film" />
      </main>
    </div>
  );
};

export default HardwareBeta;
