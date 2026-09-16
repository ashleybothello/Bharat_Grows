import React, { useState } from 'react';
import { Droplets, TrendingDown, CloudRain, ShieldCheck, Zap, Activity, Filter, CloudSnow } from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';
import { PieChart, Pie, Cell, Tooltip as RTTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function WaterFootprint() {
    const { t } = useLang();
    const [acres, setAcres] = useState(2);
    const [method, setMethod] = useState('Flood');

    // Method efficiencies
    const efficiencies = {
        'Flood': 50,
        'Furrow': 60,
        'Sprinkler': 75,
        'Drip': 90,
    };

    const eff = efficiencies[method];
    const waterDemandLiterPerAcreDay = 3500; // Base requirement for typical crop
    const waterUsedLiters = waterDemandLiterPerAcreDay * acres * (100 / eff);
    const waterSaved = waterDemandLiterPerAcreDay * acres * (100 / 50) - waterUsedLiters;

    const pieData = [
        { name: 'Crop Uptake (Evapotranspiration)', value: 50 },
        { name: 'Deep Percolation (Lost)', value: method === 'Flood' ? 30 : method === 'Drip' ? 5 : 15 },
        { name: 'Runoff (Lost)', value: method === 'Flood' ? 10 : method === 'Drip' ? 2 : 5 },
        { name: 'Evaporation (Lost)', value: method === 'Flood' ? 10 : method === 'Drip' ? 3 : 5 },
    ];

    const pieColors = ['#2563EB', '#93C5FD', '#60A5FA', '#3B82F6'];

    const monthlyUsage = [
        { month: 'Jan', Drip: 80, Sprinkler: 100, Flood: 150 },
        { month: 'Feb', Drip: 90, Sprinkler: 110, Flood: 160 },
        { month: 'Mar', Drip: 120, Sprinkler: 140, Flood: 200 },
        { month: 'Apr', Drip: 150, Sprinkler: 180, Flood: 250 },
        { month: 'May', Drip: 180, Sprinkler: 210, Flood: 300 },
        { month: 'Jun', Drip: 90, Sprinkler: 120, Flood: 180 },
    ];

    return (
        <div className="farm-page">
            <PageHeader kicker={t.pg_more_water} title={t.pg_more_water} lede={t.pg_more_water_d} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>

                {/* Calculator */}
                <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1rem 0' }}>
                        Irrigation Efficiency Calculator
                    </h2>

                    <div style={{ marginBottom: '1.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#444', marginBottom: '0.4rem' }}>
                            <span>Land Area:</span>
                            <span style={{ color: '#2563EB' }}>{acres} Acres</span>
                        </div>
                        <input type="range" min="1" max="50" value={acres} onChange={(e) => setAcres(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#2563EB' }} />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#444', marginBottom: '0.4rem' }}>
                            Current Irrigation Method:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            {Object.keys(efficiencies).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setMethod(m)}
                                    style={{
                                        padding: '0.6rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                                        background: method === m ? '#2563EB' : '#F3F4F6',
                                        color: method === m ? 'white' : '#4B5563',
                                        border: `1px solid ${method === m ? '#1D4ED8' : '#D1D5DB'}`
                                    }}
                                >
                                    {m} ({efficiencies[m]}%)
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: 'linear-gradient(135deg, #0284C7, #0369A1)', padding: '1.5rem', borderRadius: '0.75rem', color: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 700, opacity: 0.9 }}>
                            <Activity size={16} /> Daily Water Requirement
                        </div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 900 }}>
                            {Math.round(waterUsedLiters).toLocaleString()} <span style={{ fontSize: '1rem', fontWeight: 700, opacity: 0.8 }}>Liters</span>
                        </div>
                        {method !== 'Flood' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '0.3rem 0.6rem', borderRadius: '0.5rem', marginTop: '0.75rem', width: 'fit-content' }}>
                                <TrendingDown size={14} color="#6EE7B7" /> Saving {Math.round(waterSaved).toLocaleString()}L vs Flood
                            </div>
                        )}
                    </div>
                </div>

                {/* Breakdown Charts */}
                <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: '1.5rem' }}>

                    <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '120px', height: '120px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" stroke="none">
                                        {pieData.map((e, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                                    </Pie>
                                    <RTTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ flex: 1, paddingLeft: '1rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 0.5rem 0' }}>Water Distribution Fate</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {pieData.map((d, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#666' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: pieColors[i] }} />
                                        {d.name}: <strong>{d.value}%</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1rem 0' }}>Monthly Usage Comparison (kL)</h3>
                        <div style={{ width: '100%', height: '100px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthlyUsage}>
                                    <XAxis dataKey="month" hide />
                                    <Bar dataKey="Flood" fill="#93C5FD" radius={[2, 2, 0, 0]} barSize={10} />
                                    <Bar dataKey="Sprinkler" fill="#60A5FA" radius={[2, 2, 0, 0]} barSize={10} />
                                    <Bar dataKey="Drip" fill="#2563EB" radius={[2, 2, 0, 0]} barSize={10} />
                                    <RTTooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                </div>
            </div>

        </div>
    );
}
