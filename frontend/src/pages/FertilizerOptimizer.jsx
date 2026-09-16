import React, { useEffect, useState } from 'react';
import { FlaskConical, Leaf, ShieldCheck, Zap, ArrowRight, Award, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';
import { API_URL } from '../utils/api';

export default function FertilizerOptimizer() {
  const { t } = useLang();
  const [crop, setCrop] = useState('Wheat');
  const [acres, setAcres] = useState(2);
  const [targetYield, setTargetYield] = useState(25);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const calculateDose = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/fertilizer/optimize`, {
        crop,
        land_acres: acres,
        target_yield_quintals: targetYield
      });
      if (res.data?.success) {
        setResult(res.data);
      }
    } catch (err) {
      console.error('Error calculating fertilizer dose', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateDose();
  }, [crop, acres, targetYield]);

  return (
    <div className="farm-page">
      
      <PageHeader kicker={t.pg_more_fert} title={t.pg_more_fert} lede={t.pg_more_fert_d} />

      {/* Main Grid: Controls + Sustainability Scorecard */}
      <div className="bg-fluid-grid" style={{ marginBottom: '2rem' }}>
        
        {/* Controls Card */}
        <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1.2rem 0' }}>
            Yield & Land Target Parameters
          </h2>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#444', marginBottom: '0.4rem' }}>
              Target Crop:
            </label>
            <select
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
              style={{ width: '100%', padding: '0.65rem', borderRadius: '0.6rem', border: '1px solid #CCC', fontWeight: 600, fontSize: '0.9rem' }}
            >
              <option value="Wheat">🌾 Wheat (Sharbati)</option>
              <option value="Paddy">🌱 Rice / Paddy</option>
              <option value="Cotton">☁️ Cotton</option>
              <option value="Tomato">🍅 Tomato</option>
              <option value="Soybean">🫘 Soybean</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#444', marginBottom: '0.4rem' }}>
              <span>Land Area:</span>
              <span style={{ color: 'var(--primary)' }}>{acres} Acres</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              value={acres}
              onChange={(e) => setAcres(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#444', marginBottom: '0.4rem' }}>
              <span>Target Yield Goal:</span>
              <span style={{ color: '#EF6C00' }}>{targetYield} Quintals / Acre</span>
            </div>
            <input
              type="range"
              min="10"
              max="50"
              value={targetYield}
              onChange={(e) => setTargetYield(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#EF6C00' }}
            />
          </div>
        </div>

        {/* Sustainability Scorecard */}
        <div style={{ background: 'linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%)', borderRadius: '1rem', padding: '1.75rem', color: '#FFF', boxShadow: '0 8px 25px rgba(45, 106, 79, 0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.6rem', borderRadius: '1rem', width: 'fit-content', marginBottom: '0.75rem' }}>
            <Award size={14} /> Regenerative Agriculture Audit
          </div>

          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.4rem 0' }}>
            {result?.sustainability_score?.eco_rating || 'A+ Eco Standard'}
          </h3>

          <p style={{ opacity: 0.9, fontSize: '0.88rem', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
            By substituting 30% synthetic N with Nano Urea and Vermicompost, your farm qualifies for carbon credits.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', background: 'rgba(255,255,255,0.12)', borderRadius: '0.75rem', padding: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>CO2e Saved</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#52b788' }}>
                {result?.sustainability_score?.carbon_footprint_saved_kg_co2e || 290} kg
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Soil Microbiome</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#74c69d' }}>
                {result?.sustainability_score?.soil_microbiome_health_boost || '+28%'}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Dosing Tables Grid */}
      <div className="bg-fluid-grid">
        
        {/* Synthetic Dosage Schedule */}
        <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1rem 0' }}>
            Optimized Precision Dosage ({acres} Acres)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {result?.synthetic_doses.map((dose, idx) => (
              <div key={idx} style={{ padding: '0.9rem', borderRadius: '0.75rem', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-heading)' }}>{dose.name}</strong>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#EF6C00' }}>{dose.total_kg} kg</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
                  📅 Schedule: {dose.schedule}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Organic Bio-Substitutes */}
        <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1rem 0' }}>
            Organic Bio-Fertilizer Alternatives
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {result?.organic_alternatives.map((alt, idx) => (
              <div key={idx} style={{ padding: '0.9rem', borderRadius: '0.75rem', background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <strong style={{ fontSize: '0.95rem', color: '#166534' }}>{alt.name}</strong>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#15803D', background: '#DCFCE7', padding: '0.15rem 0.5rem', borderRadius: '0.4rem' }}>
                    {alt.replace_pct}
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#14532D', margin: 0 }}>
                  ✨ {alt.benefit}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
