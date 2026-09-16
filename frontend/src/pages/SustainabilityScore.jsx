import React from 'react';
import { Leaf, Award, Globe, Wind, Droplets, Zap, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';

export default function SustainabilityScore() {
    const { t } = useLang();
    const metrics = [
        { title: 'Carbon Sequestered', value: '4.2', unit: 'Tonnes', icon: <Wind size={24} color="#10B981" />, color: '#D1FAE5' },
        { title: 'Synthetic Fertilizer Cut', value: '35', unit: '%', icon: <Leaf size={24} color="#F59E0B" />, color: '#FEF3C7' },
        { title: 'Water Conserved', value: '12', unit: 'kL/month', icon: <Droplets size={24} color="#3B82F6" />, color: '#DBEAFE' },
        { title: 'Soil Biodiversity Index', value: '8.4', unit: '/10', icon: <Globe size={24} color="#8B5CF6" />, color: '#EDE9FE' },
    ];

    return (
        <div className="farm-page">
            <PageHeader kicker={t.pg_more_esg} title={t.pg_more_esg} lede={t.pg_more_esg_d} />

            <div className="bg-fluid-grid" style={{ marginBottom: '2rem' }}>

                {/* Main Score */}
                <div style={{ background: 'linear-gradient(135deg, #14532D, #166534)', borderRadius: '1rem', padding: '2rem', color: 'white', textAlign: 'center', boxShadow: '0 8px 25px rgba(22, 101, 52, 0.3)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.15)', padding: '0.3rem 0.8rem', borderRadius: '2rem', fontSize: '0.75rem', fontWeight: 800, marginBottom: '1rem' }}>
                        <ShieldCheck size={14} /> भारतGrows ESG Rating
                    </div>
                    <div style={{ fontSize: '5rem', fontWeight: 900, lineHeight: 1 }}>A-</div>
                    <p style={{ fontSize: '1rem', fontWeight: 700, margin: '1rem 0' }}>Outstanding Environmental Stewardship</p>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.75rem', fontSize: '0.85rem' }}>
                        You are in the top <strong>12%</strong> of climate-smart farms in Nashik. Eligible for 2 premium carbon credit programs.
                    </div>
                </div>

                {/* Key Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {metrics.map((m, i) => (
                        <div key={i} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '1rem', padding: '1.25rem', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                            <div style={{ background: m.color, width: '45px', height: '45px', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                                {m.icon}
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-heading)' }}>
                                {m.value} <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 600 }}>{m.unit}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#555', marginTop: '0.3rem' }}>
                                {m.title}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recommendations */}
            <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1rem 0' }}>
                    Path to AAA Rating (Zero Emission Farm)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {[
                        { id: 1, text: 'Switch remaining farm equipment to solar-powered alternatives', impact: '+15% Carbon Reduction' },
                        { id: 2, text: 'Introduce cover crops during fallow periods to prevent soil erosion', impact: '+2.1 Biodiv Score' },
                        { id: 3, text: 'Upgrade to AI-automated Drip Irrigation across all 15 remaining acres', impact: '25 kL Extra Savings' }
                    ].map(r => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Zap size={18} color="#F59E0B" />
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>{r.text}</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#16A34A', background: '#DCFCE7', padding: '0.3rem 0.6rem', borderRadius: '0.4rem' }}>
                                {r.impact}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}
