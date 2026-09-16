import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
  RadialBarChart, RadialBar,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { API_URL } from '../utils/api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { qualityLabel } from './dashboard/helpers';

const COLORS = ['#2c5a3c', '#8a5a38', '#5d6b5e', '#0e1a12', '#c9891a', '#3d6f4e', '#6b5344', '#1f3d2a'];
const QUALITY_COLORS = { Good: '#2c5a3c', Moderate: '#c9891a', Poor: '#b42318' };

const Insights = () => {
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLang();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [metricsRes, historyRes] = await Promise.all([
          axios.get(`${API_URL}/metrics`),
          axios.get(`${API_URL}/history`),
        ]);
        setMetrics(metricsRes.data);
        setHistory(historyRes.data || []);
      } catch (error) {
        console.error('Error fetching data', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="farm-page" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <Loader2 className="animate-spin" size={32} color="var(--leaf)" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="farm-page">
        <PageHeader title={t.insights_title} lede={t.insights_subtitle} />
        <EmptyState title={t.pg_ins_fail} body={t.pg_ins_fail} />
      </div>
    );
  }

  const accuracy = metrics.accuracy != null ? (metrics.accuracy * 100).toFixed(1) : null;
  let featureData = [];
  if (metrics.feature_importance) {
    featureData = Object.keys(metrics.feature_importance).map((key) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: parseFloat((metrics.feature_importance[key] * 100).toFixed(2)),
    })).sort((a, b) => b.value - a.value);
  }

  const cropCounts = {};
  history.forEach((h) => {
    (h.recommended_crops || []).forEach((c) => { cropCounts[c] = (cropCounts[c] || 0) + 1; });
  });
  const cropPieData = Object.keys(cropCounts).map((k) => ({ name: k, value: cropCounts[k] })).sort((a, b) => b.value - a.value).slice(0, 8);

  const qualityCounts = { Good: 0, Moderate: 0, Poor: 0 };
  history.forEach((h) => { if (h.soil_quality) qualityCounts[h.soil_quality]++; });
  const qualityData = Object.keys(qualityCounts)
    .filter((k) => qualityCounts[k] > 0)
    .map((k) => ({ name: qualityLabel(k, t), key: k, value: qualityCounts[k] }));

  const trendData = history.slice(0, 15).reverse().map((h, i) => ({
    analysis: `#${i + 1}`,
    N: h.n,
    P: h.p,
    K: h.k,
    pH: h.ph,
  }));

  const gaugeData = accuracy != null ? [{ name: t.pg_ins_acc, value: parseFloat(accuracy), fill: '#2c5a3c' }] : [];
  const info = metrics.dataset_info || {};
  const tooltip = { background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--ink)' };

  return (
    <div className="farm-page">
      <PageHeader kicker={t.nav_insights} title={t.insights_title} lede={t.insights_subtitle} />

      <div className="rs-grid">
        <section className="az-group">
          <h2>{t.pg_ins_acc}</h2>
          {accuracy != null ? (
            <>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" startAngle={180} endAngle={0} data={gaugeData} barSize={16}>
                    <RadialBar background={{ fill: 'rgba(20,28,22,0.06)' }} clockWise dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <p className="rs-crop" style={{ textAlign: 'center', fontSize: '2.2rem' }}>{accuracy}%</p>
              {(info.total_samples || info.test_samples) && (
                <p className="farm-note" style={{ textAlign: 'center' }}>
                  {info.total_samples ? `${info.total_samples}` : ''}
                  {info.test_samples ? ` · ${info.test_samples}` : ''}
                </p>
              )}
            </>
          ) : (
            <p className="farm-note">{t.pg_ins_no_feat}</p>
          )}
        </section>

        <section className="az-group">
          <h2>{t.pg_ins_radar}</h2>
          <div style={{ width: '100%', height: 280 }}>
            {featureData.length ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <RadarChart data={featureData}>
                  <PolarGrid stroke="rgba(20,28,22,0.12)" />
                  <PolarAngleAxis dataKey="name" tick={{ fill: 'var(--sage)', fontSize: 11 }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="#0e1a12" fill="#2c5a3c" fillOpacity={0.2} strokeWidth={1.6} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="farm-note">{t.pg_ins_no_feat}</p>
            )}
          </div>
        </section>
      </div>

      <div className="rs-grid">
        <section className="az-group">
          <h2>{t.pg_ins_feat}</h2>
          <div style={{ width: '100%', height: 280 }}>
            {featureData.length ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={featureData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(20,28,22,0.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--sage)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--sage)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltip} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#2c5a3c" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="farm-note">{t.pg_ins_no_feat}</p>
            )}
          </div>
        </section>

        <section className="az-group">
          <h2>{t.pg_ins_qual}</h2>
          <div style={{ width: '100%', height: 280 }}>
            {qualityData.length ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={qualityData} cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={3} dataKey="value" label={({ name }) => name}>
                    {qualityData.map((entry) => (
                      <Cell key={entry.key} fill={QUALITY_COLORS[entry.key] || COLORS[0]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltip} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="farm-note">{t.pg_ins_empty}</p>
            )}
          </div>
        </section>
      </div>

      {trendData.length > 0 && (
        <section className="az-group">
          <h2>{t.pg_ins_trend}</h2>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={trendData} margin={{ top: 10, right: 8, left: -16, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,28,22,0.08)" />
                <XAxis dataKey="analysis" tick={{ fontSize: 11, fill: 'var(--sage)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--sage)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltip} />
                <Area type="monotone" dataKey="N" stroke="#2c5a3c" fill="#2c5a3c22" strokeWidth={1.8} name="N" />
                <Area type="monotone" dataKey="P" stroke="#5d6b5e" fill="#5d6b5e18" strokeWidth={1.8} name="P" />
                <Area type="monotone" dataKey="K" stroke="#8a5a38" fill="#8a5a3820" strokeWidth={1.8} name="K" />
                <Area type="monotone" dataKey="pH" stroke="#0e1a12" fill="#0e1a1210" strokeWidth={1.6} name="pH" />
                <Legend wrapperStyle={{ color: 'var(--sage)', fontSize: '0.85rem' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="rs-grid">
        {cropPieData.length > 0 && (
          <section className="az-group">
            <h2>{t.pg_ins_crops}</h2>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={cropPieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name }) => name}>
                    {cropPieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <section className="az-group">
          <h2>{t.pg_ins_classes}</h2>
          <div className="az-chips">
            {(metrics.classes || []).map((cls) => (
              <span key={cls}>{cls}</span>
            ))}
          </div>
          <p className="farm-note" style={{ marginTop: '1rem' }}>
            {metrics.classes?.length || 0} {t.pg_ins_classes_n}
          </p>
        </section>
      </div>
    </div>
  );
};

export default Insights;
