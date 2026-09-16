import { useEffect, useMemo, useState } from 'react';
import { useLocation, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, TrendingUp, Send, Sparkles, History as HistoryIcon } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { useLang } from '../context/LanguageContext';
import { API_URL } from '../utils/api';
import PageHeader from '../components/PageHeader';
import DataBadge from '../components/DataBadge';
import SoilStabilizationCard from '../components/SoilStabilizationCard';
import { qualityLabel, cropLabel, openSaathi } from './dashboard/helpers';
import { getSoilStabilizationRecommendations } from '../utils/soil/soilStabilization';

const Results = () => {
  const location = useLocation();
  const { t } = useLang();
  const { result, input, sensorSource, telemetrySnapshot, usingSensors } = location.state || {};
  const [previous, setPrevious] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/history`, { timeout: 15000 });
        if (cancelled || !Array.isArray(data) || !data.length) return;
        const sameAsCurrent = (row) => input && ['n', 'p', 'k', 'ph', 'moisture'].every((key) => {
          const a = Number(row?.[key]);
          const b = Number(input[key]);
          return Number.isFinite(a) && Number.isFinite(b) && a === b;
        });
        const prior = data.find((row) => !sameAsCurrent(row));
        if (prior) setPrevious(prior);
      } catch {
        if (!cancelled) setPrevious(null);
      }
    })();
    return () => { cancelled = true; };
  }, [input]);

  const stabPack = useMemo(() => {
    if (!input) return null;
    return getSoilStabilizationRecommendations(input, {
      usingSensors: Boolean(usingSensors || telemetrySnapshot),
      telemetrySnapshot,
      previous,
    });
  }, [input, usingSensors, telemetrySnapshot, previous]);

  if (!result) return <Navigate to="/app/analyze" />;


  const { soil_quality, recommended_crops, improvement_tips, prediction_confidence, model_accuracy } = result;
  const crops = Array.isArray(recommended_crops) ? recommended_crops : [];
  const tips = Array.isArray(improvement_tips) ? improvement_tips : [];
  const cropPred = result.crop_prediction || null;
  const lead = cropPred?.recommended_crop || crops[0];
  const modelProba = cropPred?.model_probability
    ?? (prediction_confidence != null ? prediction_confidence : null);
  const modelFeatures = cropPred?.features_received || null;

  // Present only on results from /api/ml/crop-decision. Older results saved from
  // the plain /predict path simply omit these sections.
  const decision = result.decision || null;
  const rainfall = result.rainfall_intelligence || null;
  const irrigation = result.irrigation || null;
  const marketPrices = result.market_inputs?.prices || {};
  const pricedCrops = Object.entries(marketPrices);
  const rainfallFeature = result.rainfall_feature || null;

  const radarData = input ? [
    { param: t.analyze_nitrogen, value: Math.min(input.n || 0, 140) },
    { param: t.analyze_phosphorus, value: Math.min(input.p || 0, 145) },
    { param: t.analyze_potassium, value: Math.min(input.k || 0, 205) },
    { param: t.analyze_ph, value: (input.ph || 0) * 10 },
    { param: t.analyze_temperature, value: Math.min(input.temperature || 0, 45) },
    { param: t.analyze_humidity, value: Math.min(input.humidity || 0, 100) },
  ] : [];

  const snapshotConds = telemetrySnapshot?.sensors
    ? Object.values(telemetrySnapshot.sensors).map((item) => ({
      label: item.label,
      value: item.value,
      unit: item.unit || '',
      status: item.status,
    }))
    : null;

  const conds = snapshotConds || (input ? [
    { label: t.analyze_nitrogen, value: input.n, unit: 'mg/kg' },
    { label: t.analyze_phosphorus, value: input.p, unit: 'mg/kg' },
    { label: t.analyze_potassium, value: input.k, unit: 'mg/kg' },
    { label: t.analyze_ph, value: input.ph, unit: '' },
    { label: t.analyze_moisture, value: input.moisture, unit: '%' },
    { label: t.analyze_temperature, value: input.temperature, unit: '°C' },
    { label: t.analyze_humidity, value: input.humidity, unit: '%' },
    { label: t.analyze_rainfall, value: input.rainfall, unit: 'mm' },
  ] : []);

  return (
    <div className="farm-page">
      <PageHeader
        kicker={t.nav_results}
        title={t.pg_results_insight}
        lede={t.pg_results_from_model}
        tools={<DataBadge kind={sensorSource ? 'demo' : 'analysis'} />}
      />

      <Link to="/app/analyze" className="mkt-back" style={{ marginBottom: '1rem' }}>
        <ArrowLeft size={16} /> {t.pg_new_analysis}
      </Link>

      {sensorSource && (
        <p className="farm-note">{t.pg_az_source}: {sensorSource}</p>
      )}

      <section className="rs-hero">
        <div>
          <p className="pg-kicker" style={{ color: 'rgba(246,241,231,0.55)' }}>{t.pg_crop_ai}</p>
          <p className="rs-crop">{lead ? cropLabel(lead, t) : '—'}</p>
          <p>{lead ? t.pg_best_match : t.pg_crop_unavailable}</p>
        </div>
        <dl className="rs-side">
          <dt>{t.results_quality}</dt>
          <dd>{qualityLabel(soil_quality, t)}</dd>
          {modelProba != null && (
            <>
              <dt>{t.pg_model_proba}</dt>
              <dd className="tabular">{Number(modelProba).toFixed(4)}</dd>
            </>
          )}
        </dl>
      </section>

      {modelFeatures && (
        <section className="az-group">
          <h2>{t.pg_crop_ai}</h2>
          <p className="az-meta" style={{ marginTop: 0 }}>{t.pg_crop_ai_sub}</p>
          <dl className="rs-conds">
            {['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall'].map((key) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd className="tabular">{modelFeatures[key]}</dd>
              </div>
            ))}
          </dl>
          {cropPred?.top_crops?.length > 0 && (
            <div className="az-chips" style={{ marginTop: '1rem' }}>
              <span>{t.pg_alt_crop}:</span>
              {cropPred.top_crops.map((row) => (
                <span key={row.crop}>
                  {cropLabel(row.crop, t)}
                  {row.probability != null ? ` ${Number(row.probability).toFixed(4)}` : ''}
                </span>
              ))}
            </div>
          )}
          {result.crop_explanation && (
            <p className="rs-why">
              <strong>{t.pg_interp}:</strong> {result.crop_explanation}
            </p>
          )}
          <p className="farm-note">{t.pg_heldout_acc}: {model_accuracy != null ? Number(model_accuracy).toFixed(4) : '—'}</p>
        </section>
      )}

      <div className="rs-grid">
        <section className="az-group">
          <h2>{t.pg_results_why}</h2>
          <p className="az-meta" style={{ marginTop: 0, marginBottom: '0.85rem' }}>{t.pg_results_from_model}</p>
          {tips.length ? (
            <ol className="rs-tips">
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ol>
          ) : (
            <p className="farm-note">{t.pg_no_tips}</p>
          )}
          {cropPred?.top_crops?.length > 1 ? (
            <div className="az-chips" style={{ marginTop: '1rem' }}>
              <span>{t.pg_alt_crop}:</span>
              {cropPred.top_crops.slice(1).map((row) => (
                <span key={row.crop}>
                  {cropLabel(row.crop, t)}
                  {row.probability != null ? ` ${Number(row.probability).toFixed(4)}` : ''}
                </span>
              ))}
            </div>
          ) : crops.length > 1 ? (
            <div className="az-chips" style={{ marginTop: '1rem' }}>
              <span>{t.pg_alt_crop}:</span>
              {crops.slice(1).map((crop) => (
                <span key={crop}>{cropLabel(crop, t)}</span>
              ))}
            </div>
          ) : null}
        </section>

        {radarData.length > 0 && (
          <section className="az-group">
            <h2>{t.pg_soil_fit}</h2>
            <p className="az-meta" style={{ marginTop: 0 }}>{qualityLabel(soil_quality, t)}</p>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(20,28,22,0.12)" />
                  <PolarAngleAxis dataKey="param" tick={{ fill: 'var(--sage)', fontSize: 11 }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="#0e1a12" fill="#2c5a3c" fillOpacity={0.18} strokeWidth={1.6} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </div>

      {stabPack && <SoilStabilizationCard pack={stabPack} />}

      {decision && (
        <section className="az-group">
          <h2>{t.pg_decision_h}</h2>
          <p className="az-meta" style={{ marginTop: 0 }}>{t.pg_decision_sub}</p>

          <ol className="rs-rank">
            {decision.ranked_crops.map((row) => (
              <li key={row.crop} className={row.crop === decision.recommended_crop ? 'is-lead' : ''}>
                <div className="rs-rank-head">
                  <strong>{cropLabel(row.crop, t)}</strong>
                  <span className="tabular">{row.decision_score.toFixed(2)}</span>
                </div>
                <dl className="rs-rank-parts">
                  <div>
                    <dt>{t.pg_decision_crop_fit}</dt>
                    <dd className="tabular">{(row.components.crop_suitability * 100).toFixed(1)}%</dd>
                  </div>
                  {row.components.market_attractiveness != null && (
                    <div>
                      <dt>{t.pg_decision_market}</dt>
                      <dd className="tabular">
                        {row.market_price_available
                          ? row.components.market_attractiveness.toFixed(2)
                          : t.pg_decision_no_price}
                      </dd>
                    </div>
                  )}
                  {row.components.field_water_condition != null && (
                    <div>
                      <dt>{t.pg_decision_water}</dt>
                      <dd className="tabular">{row.components.field_water_condition.toFixed(2)}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ol>

          <p className="rs-why">{decision.explanation}</p>

          <div className="az-chips" style={{ marginTop: '0.9rem' }}>
            <span>{t.pg_decision_weights}:</span>
            {Object.entries(decision.weights_used).map(([name, weight]) => (
              <span key={name}>{`${name} ${(weight * 100).toFixed(0)}%`}</span>
            ))}
          </div>
          <p className="farm-note">{decision.methodology_note}</p>
        </section>
      )}

      {rainfall && (
        <section className="az-group">
          <h2>{t.pg_rain_ai}</h2>
          <p className="az-meta" style={{ marginTop: 0 }}>{t.pg_rain_sub}</p>

          <dl className="rs-conds">
            <div>
              <dt>{t.pg_rain_today}</dt>
              <dd className="tabular">{rainfall.rainfall_today_mm} mm</dd>
            </div>
            <div>
              <dt>{t.pg_rain_24h}</dt>
              <dd className="tabular">{rainfall.rainfall_next_24h_mm} mm</dd>
            </div>
            <div>
              <dt>{t.pg_rain_3d}</dt>
              <dd className="tabular">{rainfall.rainfall_next_3_days_mm} mm</dd>
            </div>
            <div>
              <dt>{t.pg_rain_trend}</dt>
              <dd>{rainfall.rainfall_trend}</dd>
            </div>
            <div>
              <dt>{t.pg_rain_dry}</dt>
              <dd>{rainfall.dry_spell_risk}</dd>
            </div>
            <div>
              <dt>{t.pg_rain_heavy}</dt>
              <dd>{rainfall.heavy_rain_risk}</dd>
            </div>
            <div>
              <dt>{t.pg_rain_waterlog}</dt>
              <dd>{rainfall.waterlogging_risk}</dd>
            </div>
            {rainfall.historical_context?.available && (
              <div>
                <dt>{t.pg_rain_baseline}</dt>
                <dd className="tabular">{rainfall.historical_context.monthly_baseline_mm} mm</dd>
              </div>
            )}
          </dl>

          {rainfall.historical_context?.available && (
            <p className="farm-note">
              {rainfall.historical_context.subdivision} · {rainfall.historical_context.period} ·{' '}
              {rainfall.historical_context.geographic_note}
            </p>
          )}

          {irrigation && (
            <p className="rs-why">
              <strong>{t.pg_rain_irrigation}: {irrigation.decision}</strong> — {irrigation.reason}
            </p>
          )}

          <p className="farm-note">{rainfall.method?.forecast_source} · {rainfall.method?.type}</p>
        </section>
      )}

      {!rainfall && (
        <section className="az-group">
          <h2>{t.pg_rain_ai}</h2>
          <p className="farm-note">{t.pg_rain_unavailable}</p>
        </section>
      )}

      {pricedCrops.length > 0 && (
        <section className="az-group">
          <h2>{t.pg_rmkt_h}</h2>
          <p className="az-meta" style={{ marginTop: 0 }}>{t.pg_rmkt_sub}</p>
          <dl className="rs-conds">
            {pricedCrops.map(([crop, info]) => (
              <div key={crop}>
                <dt>{cropLabel(crop, t)}</dt>
                <dd className="tabular">₹{info.modal_price.toLocaleString('en-IN')}</dd>
                <p className="farm-note" style={{ margin: '0.2rem 0 0' }}>
                  {info.commodity} · {info.scope} · {info.arrival_date}
                </p>
              </div>
            ))}
          </dl>
          <p className="farm-note">{result.market_inputs?.source}</p>
        </section>
      )}

      {input && (
        <>
          <h2 className="az-group" style={{ marginBottom: '0.55rem' }}>{t.pg_climate_fit}</h2>
          <dl className="rs-conds">
            <div>
              <dt>{t.analyze_temperature}</dt>
              <dd className="tabular">{input.temperature}°C</dd>
            </div>
            <div>
              <dt>{t.analyze_humidity}</dt>
              <dd className="tabular">{input.humidity}%</dd>
            </div>
            <div>
              <dt>{t.analyze_rainfall}</dt>
              <dd className="tabular">
                {rainfallFeature ? rainfallFeature.value_mm : input.rainfall} mm
              </dd>
            </div>
          </dl>
          {rainfallFeature && (
            <p className="farm-note">
              {t.pg_rain_feature_src}: {rainfallFeature.source}
            </p>
          )}

          <h2 className="az-group" style={{ marginBottom: '0.55rem' }}>{t.pg_field_cond}</h2>
          <dl className="rs-conds">
            {conds.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd className="tabular">
                  {item.value}{item.unit ? ` ${item.unit}` : ''}
                  {item.status ? ` · ${item.status}` : ''}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {result.disclaimer && <p className="rs-disclaimer">{result.disclaimer}</p>}

      {result.saved === false && (
        <p className="farm-note">{t.pg_not_saved}</p>
      )}

      <div className="farm-cta-actions">
        <Link to="/app/market" className="btn-primary">
          <TrendingUp size={16} /> {t.pg_view_market}
        </Link>
        <Link to="/app/analyze" className="btn-secondary">
          {t.pg_analyze_again}
        </Link>
        <button type="button" className="btn-secondary" onClick={openSaathi}>
          <Sparkles size={16} /> {t.pg_ask_saathi}
        </button>
        <Link to="/app/history" className="btn-secondary">
          <HistoryIcon size={16} /> {t.pg_view_history}
        </Link>
        <Link to="/app/communication" className="btn-secondary">
          <Send size={16} /> {t.pg_sms}
        </Link>
        <Link to="/app/insights" className="btn-secondary">
          {t.pg_view_insights}
        </Link>
      </div>
    </div>
  );
};

export default Results;
