import React, { useState } from 'react';
import { Landmark, Search, Filter, FileText, CheckCircle, ExternalLink, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';

const schemes = [
    { id: 1, name: 'PM-KISAN Samman Nidhi', category: 'Financial', amount: '₹6,000/year', eligibility: 'Small & Marginal Farmers', deadline: 'Ongoing', desc: 'Direct income support to farmer families across India.', color: '#10B981', url: 'https://pmkisan.gov.in/' },
    { id: 2, name: 'PM Fasal Bima Yojana (PMFBY)', category: 'Insurance', amount: 'Variable', eligibility: 'All Farmers', deadline: 'Jul 31 (Kharif)', desc: 'Crop insurance for yield losses due to non-preventable risks.', color: '#F59E0B', url: 'https://pmfby.gov.in/' },
    { id: 3, name: 'Sub-Mission on Agricultural Mechanization (SMAM)', category: 'Subsidy', amount: 'Up to 50%', eligibility: 'SC/ST, Small Farmers', deadline: 'State specific', desc: 'Subsidy on purchase of agricultural machinery and tractors.', color: '#3B82F6', url: 'https://agromachinery.nic.in/' },
    { id: 4, name: 'Paramparagat Krishi Vikas Yojana (PKVY)', category: 'Subsidy', amount: '₹50,000/ha', eligibility: 'Organic Farmers', deadline: 'Ongoing', desc: 'Financial assistance to promote organic farming practices.', color: '#10B981', url: 'https://pgsindia-ncof.gov.in/pkvy/index.aspx' },
    { id: 5, name: 'Soil Health Card Scheme', category: 'Advisory', amount: 'Free', eligibility: 'All Farmers', deadline: 'Ongoing', desc: 'Free soil testing and tailored fertilizer recommendations.', color: '#8B5CF6', url: 'https://soilhealth.dac.gov.in/' },
    { id: 6, name: 'PM Kusum Yojana', category: 'Energy', amount: 'Up to 60% Subsidy', eligibility: 'Farmers with irrigation', deadline: 'State specific', desc: 'Subsidy for setting up standalone solar pumps.', color: '#EAB308', url: 'https://pmkusum.mnre.gov.in/' },
];

export default function GovSchemes() {
    const { t } = useLang();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');

    const categories = ['All', 'Financial', 'Insurance', 'Subsidy', 'Advisory', 'Energy'];
    const categoryLabel = (c) => ({
        All: t.pg_schemes_all,
        Financial: t.pg_schemes_financial,
        Insurance: t.pg_schemes_insurance,
        Subsidy: t.pg_schemes_subsidy,
        Advisory: t.pg_schemes_advisory,
        Energy: t.pg_schemes_energy,
    }[c] || c);

    const filteredSchemes = schemes.filter(s => {
        const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.desc.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCat = activeCategory === 'All' || s.category === activeCategory;
        return matchSearch && matchCat;
    });

    return (
        <div className="farm-page">
            <PageHeader kicker={t.pg_more_gov} title={t.pg_more_gov} lede={t.pg_more_gov_d} />

            {/* Recommended Schemes Banner */}
            <div style={{ background: 'linear-gradient(135deg, #1D4ED8, #2563EB)', borderRadius: '1rem', padding: '1.75rem', color: 'white', marginBottom: '2rem', boxShadow: '0 8px 25px rgba(37, 99, 235, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <Activity size={18} color="#93C5FD" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.6rem', borderRadius: '1rem' }}>{t.pg_schemes_match}</span>
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>{t.pg_schemes_eligible}</h2>
                <p style={{ opacity: 0.9, fontSize: '0.95rem', margin: '0 0 1rem 0', maxWidth: '600px' }}>
                    {t.pg_schemes_eligible_p}
                </p>
                <button onClick={() => window.open('https://pmkusum.mnre.gov.in/', '_blank')} style={{ background: 'white', color: '#1D4ED8', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '0.5rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {t.pg_schemes_apply} <ExternalLink size={16} />
                </button>
            </div>

            {/* Filters & Search */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                    <Search size={18} color="#888" style={{ position: 'absolute', insetInlineStart: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        placeholder={t.pg_schemes_search}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '0.8rem 1rem', paddingInlineStart: '2.8rem', borderRadius: '0.8rem', border: '1px solid #E5E7EB', outline: 'none', fontSize: '0.9rem', fontWeight: 600 }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                    {categories.map(c => (
                        <button
                            key={c}
                            onClick={() => setActiveCategory(c)}
                            style={{
                                background: activeCategory === c ? '#2563EB' : 'white',
                                color: activeCategory === c ? 'white' : '#4B5563',
                                border: `1px solid ${activeCategory === c ? '#1D4ED8' : '#E5E7EB'}`,
                                padding: '0.5rem 1rem', borderRadius: '0.6rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap'
                            }}
                        >
                            {categoryLabel(c)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Schemes Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {filteredSchemes.map(s => (
                    <motion.div
                        key={s.id}
                        whileHover={{ y: -4 }}
                        style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <span style={{ background: `${s.color}15`, color: s.color, padding: '0.3rem 0.6rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 800 }}>
                                {categoryLabel(s.category)}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#666', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <CheckCircle size={14} color="#10B981" /> {t.pg_schemes_deadline}: {s.deadline}
                            </span>
                        </div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 0.5rem 0' }}>{s.name}</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: 1.5, margin: '0 0 1.2rem 0', flex: 1 }}>{s.desc}</p>

                        <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                                <span style={{ color: '#444' }}>{t.pg_schemes_benefit}:</span>
                                <span style={{ fontWeight: 800, color: '#10B981' }}>{s.amount}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                <span style={{ color: '#444' }}>{t.pg_schemes_elig}:</span>
                                <span style={{ fontWeight: 700, color: '#334155' }}>{s.eligibility}</span>
                            </div>
                        </div>

                        <button onClick={() => window.open(s.url, '_blank')} style={{ width: '100%', background: 'white', color: '#2563EB', border: '1px solid #2563EB', padding: '0.6rem', borderRadius: '0.6rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.2s' }} onMouseEnter={e => { e.target.style.background = '#EFF6FF' }} onMouseLeave={e => { e.target.style.background = 'white' }}>
                            {t.pg_schemes_view} <ExternalLink size={16} />
                        </button>
                    </motion.div>
                ))}
                {filteredSchemes.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#888' }}>{t.pg_schemes_none}</div>
                )}
            </div>

        </div>
    );
}
