import { useState } from 'react';
import { Leaf, Droplets, FlaskConical, Sprout } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const ICONS = {
  organic_n: Leaf,
  phos: Sprout,
  potash: Sprout,
  lime: FlaskConical,
  alkaline_om: Leaf,
  irrigate: Droplets,
  drain: Droplets,
  retest: FlaskConical,
  maintain_om: Leaf,
  maintain_water: Droplets,
  maintain_test: FlaskConical,
  maintain_balance: Sprout,
};

function fill(template, vars = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] != null && vars[key] !== '' ? String(vars[key]) : ''
  ));
}

function severityClass(severity) {
  if (severity === 'CRITICAL') return 'is-critical';
  if (severity === 'HIGH') return 'is-high';
  if (severity === 'MODERATE') return 'is-mod';
  return 'is-ok';
}

export default function SoilStabilizationCard({ pack }) {
  const { t } = useLang();
  const [openWhy, setOpenWhy] = useState(null);

  if (!pack || pack.overallStatus === 'empty') return null;

  const sourceLabel = pack.sourceKind === 'hardware'
    ? t.pg_stab_src_hw
    : pack.sourceKind === 'simulated'
      ? t.pg_stab_src_sim
      : t.pg_stab_src_meas;

  const overallLabel = pack.overallStatus === 'stable' ? t.pg_stab_stable : t.pg_stab_attention;
  const actions = pack.overallStatus === 'stable' ? pack.maintenanceTips : pack.recommendations;
  const v = pack.values || {};

  return (
    <section className="az-group stab-card">
      <p className="pg-kicker">{t.pg_stab_kicker}</p>
      <h2>{t.pg_stab_title}</h2>
      <p className="az-meta" style={{ marginTop: 0 }}>{t.pg_stab_lede}</p>
      <p className="farm-note">{sourceLabel}</p>

      <div className="stab-overall">
        <span>{t.pg_stab_overall}</span>
        <strong className={`stab-pill ${pack.overallStatus === 'stable' ? 'is-ok' : 'is-high'}`}>
          {overallLabel}
        </strong>
      </div>

      {pack.issues.length > 0 && (
        <div className="stab-pills" aria-label={t.pg_stab_detected}>
          {pack.issues.map((issue) => (
            <span key={issue.id} className={`stab-pill ${severityClass(issue.severity)}`}>
              {t[issue.labelKey]}
            </span>
          ))}
        </div>
      )}

      {pack.overallStatus === 'stable' && (
        <p className="rs-why" style={{ marginTop: '0.85rem' }}>{t.pg_stab_balanced}</p>
      )}

      <h3 className="stab-actions-h">{t.pg_stab_actions}</h3>
      <ol className="stab-actions">
        {actions.map((item, index) => {
          const Icon = ICONS[item.id] || Leaf;
          const issue = pack.issues.find((row) => item.issueIds?.includes(row.id));
          const whyVars = issue
            ? { value: issue.value, unit: issue.unit, min: issue.range?.[0], max: issue.range?.[1] }
            : {};
          return (
            <li key={item.id}>
              <div className="stab-action-head">
                <Icon size={18} />
                <strong>{index + 1}. {t[item.titleKey]}</strong>
              </div>
              <p>{t[item.bodyKey]}</p>
              <button
                type="button"
                className="stab-why-btn"
                onClick={() => setOpenWhy(openWhy === item.id ? null : item.id)}
              >
                {t.pg_stab_why}
              </button>
              {openWhy === item.id && (
                <p className="stab-why-body">{fill(t[item.whyKey], whyVars)}</p>
              )}
            </li>
          );
        })}
      </ol>

      <dl className="rs-conds stab-metrics">
        {v.n != null && (
          <div>
            <dt>N</dt>
            <dd className="tabular">{v.n} mg/kg</dd>
          </div>
        )}
        {v.p != null && (
          <div>
            <dt>P</dt>
            <dd className="tabular">{v.p} mg/kg</dd>
          </div>
        )}
        {v.k != null && (
          <div>
            <dt>K</dt>
            <dd className="tabular">{v.k} mg/kg</dd>
          </div>
        )}
        {v.ph != null && (
          <div>
            <dt>pH</dt>
            <dd className="tabular">{v.ph}</dd>
          </div>
        )}
        {v.moisture != null && (
          <div>
            <dt>{t.analyze_moisture}</dt>
            <dd className="tabular">{v.moisture}%</dd>
          </div>
        )}
      </dl>

      {pack.comparison?.kind === 'improving' && (
        <p className="farm-note stab-trend">
          {t.pg_stab_improving}
          {pack.comparison.ph && ` · pH ${pack.comparison.ph.previous} → ${pack.comparison.ph.current}`}
          {pack.comparison.n && ` · N ${pack.comparison.n.previous} → ${pack.comparison.n.current}`}
          {pack.comparison.moisture && ` · ${t.analyze_moisture} ${pack.comparison.moisture.previous}% → ${pack.comparison.moisture.current}%`}
        </p>
      )}

      <p className="rs-disclaimer">{t.pg_stab_disclaimer}</p>
    </section>
  );
}
