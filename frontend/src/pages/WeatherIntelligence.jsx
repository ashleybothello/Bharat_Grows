import { useEffect, useState } from 'react';
import { CloudSun, Droplets, Wind, CloudRain, Thermometer } from 'lucide-react';
import { Link } from 'react-router-dom';
import DataBadge from '../components/DataBadge';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { requestRainfallIntelligence, mlErrorMessage } from '../utils/api';
import { fetchAnalysisInput, fetchNodes } from '../utils/telemetry';

const INDORE = { latitude: 22.7196, longitude: 75.8577 };

export default function WeatherIntelligence() {
  const { t } = useLang();
  const { farmer } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [coordNote, setCoordNote] = useState('');
  const [sensorRain, setSensorRain] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        let latitude = Number(farmer?.profile?.latitude);
        let longitude = Number(farmer?.profile?.longitude);
        let note = t.pg_wx_coords_farm;

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          try {
            const pack = await fetchNodes();
            const node = (pack.nodes || []).find((n) => n.coordinates?.latitude != null);
            if (node) {
              latitude = Number(node.coordinates.latitude);
              longitude = Number(node.coordinates.longitude);
              note = `${t.pg_map_node} ${node.nodeNumber}`;
            }
          } catch {
            /* nodes optional */
          }
        }

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          latitude = INDORE.latitude;
          longitude = INDORE.longitude;
          note = t.pg_wx_coords_default;
        }

        const result = await requestRainfallIntelligence({
          latitude,
          longitude,
          state: farmer?.profile?.state || undefined,
        });
        if (cancelled) return;
        setData(result);
        setCoordNote(note);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(mlErrorMessage(err, t) || t.pg_rain_unavailable);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    (async () => {
      try {
        const snap = await fetchAnalysisInput({ scope: 'farm' });
        if (!cancelled) setSensorRain(snap.context?.rain_recent_mm ?? null);
      } catch {
        if (!cancelled) setSensorRain(null);
      }
    })();

    return () => { cancelled = true; };
  }, [farmer, t]);

  const current = data?.current_weather || {};
  const method = data?.method || {};
  const slots = data ? [
    { icon: Thermometer, label: t.analyze_temperature, value: current.temperature_c, unit: '°C' },
    { icon: Droplets, label: t.analyze_humidity, value: current.humidity_pct, unit: '%' },
    { icon: CloudRain, label: t.pg_rain_today, value: data.rainfall_today_mm, unit: 'mm' },
    { icon: CloudRain, label: t.pg_rain_24h, value: data.rainfall_next_24h_mm, unit: 'mm' },
    { icon: CloudRain, label: t.pg_rain_3d, value: data.rainfall_next_3_days_mm, unit: 'mm' },
    { icon: Wind, label: t.pg_wx_wind, value: current.wind_speed_kmh, unit: 'km/h' },
  ] : [];

  return (
    <div className="farm-page">
      <PageHeader
        kicker={t.pg_more_wx}
        title={t.pg_wx_h}
        lede={t.pg_wx_p}
        tools={<DataBadge kind={data ? 'live' : error ? 'error' : 'waiting'} />}
      />

      {loading && (
        <EmptyState icon={CloudSun} title={t.pg_wx_loading} body={t.pg_wx_p} />
      )}

      {!loading && error && (
        <EmptyState icon={CloudSun} title={t.pg_rain_unavailable} body={error} />
      )}

      {!loading && data && (
        <>
          <p className="farm-note">{t.pg_wx_source}</p>
          {coordNote && <p className="farm-note">{coordNote}</p>}

          <div className="tele-grid" style={{ marginTop: '1.1rem' }}>
            {slots.map((slot) => {
              const Icon = slot.icon;
              return (
                <article key={slot.label} className="tele-cell">
                  <div className="tele-cell-top">
                    <Icon size={16} />
                    <span>{slot.label}</span>
                  </div>
                  <p className="tele-value">{slot.value == null ? '—' : slot.value}</p>
                  <p className="tele-unit">{slot.unit}</p>
                  <p className="tele-meta">{method.forecast_source || t.pg_wx_forecast}</p>
                </article>
              );
            })}
          </div>

          <section className="az-group" style={{ marginTop: '1.1rem' }}>
            <h2>{t.pg_rain_ai}</h2>
            <dl className="rs-conds">
              <div>
                <dt>{t.pg_rain_trend}</dt>
                <dd>{data.rainfall_trend}</dd>
              </div>
              <div>
                <dt>{t.pg_rain_dry}</dt>
                <dd>{data.dry_spell_risk}</dd>
              </div>
              <div>
                <dt>{t.pg_rain_heavy}</dt>
                <dd>{data.heavy_rain_risk}</dd>
              </div>
              <div>
                <dt>{t.pg_rain_waterlog}</dt>
                <dd>{data.waterlogging_risk}</dd>
              </div>
              {data.historical_context?.available && (
                <div>
                  <dt>{t.pg_rain_baseline}</dt>
                  <dd className="tabular">{data.historical_context.monthly_baseline_mm} mm</dd>
                </div>
              )}
            </dl>
            {data.historical_context?.available && (
              <p className="farm-note">
                {data.historical_context.subdivision} · {data.historical_context.period} ·{' '}
                {data.historical_context.geographic_note}
              </p>
            )}
            <p className="farm-note">{method.type}</p>
          </section>
        </>
      )}

      {sensorRain != null && (
        <section className="az-group" style={{ marginTop: '1.1rem' }}>
          <h2>{t.pg_az_snapshot}</h2>
          <p className="farm-note">{t.pg_az_rain_note}: {sensorRain} mm</p>
        </section>
      )}

      <section className="az-group" style={{ marginTop: '1.1rem' }}>
        <h2>{t.pg_wx_tied}</h2>
        <p className="farm-note">{t.pg_wx_tied_p}</p>
        <Link to="/app/analyze" className="farm-inline">{t.pg_analyze_h}</Link>
      </section>
    </div>
  );
}
