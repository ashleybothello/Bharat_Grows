import React, { useState } from 'react';
import { Calendar, Sprout, Leaf, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';
import { readLatestAnalysis } from '../utils/latestAnalysis';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const seasons = [
    { name: 'Rabi', months: [10, 11, 0, 1, 2], color: '#2563EB', emoji: '❄️' },
    { name: 'Kharif', months: [5, 6, 7, 8, 9], color: '#16A34A', emoji: '🌧️' },
    { name: 'Zaid', months: [2, 3, 4, 5], color: '#D97706', emoji: '☀️' },
];

const crops = [
    {
        name: 'Wheat', emoji: '🌾', season: 'Rabi', color: '#D97706',
        stages: [
            { month: 10, stage: 'Sowing', tip: 'Prepare seedbed, apply basal fertilizer.' },
            { month: 11, stage: 'Germination', tip: 'First irrigation at 21 DAS.' },
            { month: 0, stage: 'Tillering', tip: 'Apply 2nd dose nitrogen. Monitor aphids.' },
            { month: 1, stage: 'Heading', tip: 'Critical irrigation at boot stage.' },
            { month: 2, stage: 'Grain Fill', tip: 'Last irrigation at dough stage.' },
            { month: 3, stage: 'Harvest', tip: 'Harvest at 14% moisture content.' },
        ]
    },
    {
        name: 'Rice', emoji: '🌱', season: 'Kharif', color: '#16A34A',
        stages: [
            { month: 5, stage: 'Nursery', tip: 'Prepare nursery beds. Soak seeds 24h.' },
            { month: 6, stage: 'Transplanting', tip: 'Transplant 25-day seedlings at 20x15cm.' },
            { month: 7, stage: 'Vegetative', tip: 'Maintain 5cm water. Nitrogen top-dress.' },
            { month: 8, stage: 'Flowering', tip: 'Ensure water. Watch for blast disease.' },
            { month: 9, stage: 'Maturity', tip: 'Drain field 15 days before harvest.' },
            { month: 10, stage: 'Harvest', tip: 'Harvest when 80% grains golden.' },
        ]
    },
    {
        name: 'Cotton', emoji: '☁️', season: 'Kharif', color: '#6366F1',
        stages: [
            { month: 4, stage: 'Land Prep', tip: 'Deep ploughing. Apply FYM 10 T/ha.' },
            { month: 5, stage: 'Sowing', tip: 'Sow on ridges at 90x45cm spacing.' },
            { month: 6, stage: 'Vegetative', tip: 'Thin seedlings. First hoeing 20 DAS.' },
            { month: 7, stage: 'Squaring', tip: 'Apply potassium. Monitor bollworm.' },
            { month: 8, stage: 'Boll Formation', tip: 'Critical irrigation. Pheromone traps.' },
            { month: 9, stage: 'Picking', tip: 'First picking when 60% bolls open.' },
        ]
    },
    {
        name: 'Tomato', emoji: '🍅', season: 'Rabi', color: '#DC2626',
        stages: [
            { month: 8, stage: 'Nursery', tip: 'Raise seedlings in trays with shade.' },
            { month: 9, stage: 'Transplanting', tip: 'Transplant at 60x45cm spacing.' },
            { month: 10, stage: 'Vegetative', tip: 'Stake plants. Apply NPK fertilizer.' },
            { month: 11, stage: 'Flowering', tip: 'Spray micronutrients (Boron).' },
            { month: 0, stage: 'Fruiting', tip: 'Harvest every 3-4 days. Monitor blight.' },
            { month: 1, stage: 'Peak Harvest', tip: 'Grade by color and size.' },
        ]
    },
    {
        name: 'Sugarcane', emoji: '🎋', season: 'Zaid', color: '#059669',
        stages: [
            { month: 1, stage: 'Planting', tip: 'Use 3-bud setts. 75cm row spacing.' },
            { month: 2, stage: 'Germination', tip: 'Light irrigation every 7 days.' },
            { month: 4, stage: 'Tillering', tip: 'Earthing up. Apply nitrogen 2nd dose.' },
            { month: 6, stage: 'Grand Growth', tip: 'Heavy irrigation. De-trash leaves.' },
            { month: 9, stage: 'Maturation', tip: 'Withhold irrigation for ripening.' },
            { month: 11, stage: 'Harvest', tip: 'Cut close to ground. Mill within 24h.' },
        ]
    },
    {
        name: 'Soybean', emoji: '🫘', season: 'Kharif', color: '#84CC16',
        stages: [
            { month: 5, stage: 'Sowing', tip: 'Inoculate with Rhizobium. 45cm rows.' },
            { month: 6, stage: 'Vegetative', tip: 'Inter-cultivation at 20 DAS.' },
            { month: 7, stage: 'Flowering', tip: 'Critical moisture stage.' },
            { month: 8, stage: 'Pod Fill', tip: 'Monitor for girdle beetle.' },
            { month: 9, stage: 'Maturity', tip: 'Harvest when leaves yellow.' },
        ]
    },
    {
        name: 'Mustard', emoji: '🌻', season: 'Rabi', color: '#EAB308',
        stages: [
            { month: 9, stage: 'Sowing', tip: 'Line sowing at 30cm. Seed rate 5 kg/ha.' },
            { month: 10, stage: 'Vegetative', tip: 'First irrigation at 25-30 DAS.' },
            { month: 11, stage: 'Flowering', tip: 'Spray against aphids.' },
            { month: 0, stage: 'Pod Formation', tip: 'Third irrigation at pod filling.' },
            { month: 1, stage: 'Maturity', tip: 'Harvest when 75% pods brown.' },
        ]
    },
    {
        name: 'Groundnut', emoji: '🥜', season: 'Kharif', color: '#A16207',
        stages: [
            { month: 5, stage: 'Sowing', tip: 'Sow kernels at 30x10cm. Apply gypsum.' },
            { month: 6, stage: 'Vegetative', tip: 'Earthing up at 45 DAS.' },
            { month: 7, stage: 'Flowering', tip: 'Apply gypsum for peg formation.' },
            { month: 8, stage: 'Pod Dev', tip: 'Ensure soil moisture. No waterlogging.' },
            { month: 9, stage: 'Harvest', tip: 'Pull when leaves yellow. Sun-dry 3-4d.' },
        ]
    },
];

const getMonthColor = (mi) => {
    for (const s of seasons) if (s.months.includes(mi)) return s.color;
    return '#94A3B8';
};

export default function CropCalendar() {
    const { t } = useLang();
    const last = readLatestAnalysis();
    const recommended = last?.crop_prediction?.recommended_crop || last?.recommended_crops?.[0] || '';
    const matchIdx = crops.findIndex((c) => c.name.toLowerCase() === String(recommended).toLowerCase());
    const [selCrop, setSelCrop] = useState(matchIdx >= 0 ? matchIdx : 0);
    const [selMonth, setSelMonth] = useState(new Date().getMonth());
    const crop = crops[selCrop];
    const activeStage = crop.stages.find(s => s.month === selMonth);
    const activeCropsInMonth = crops.filter(c => c.stages.some(s => s.month === selMonth));

    return (
        <div className="farm-page">
            <PageHeader kicker={t.pg_more_cal} title={t.pg_more_cal} lede={t.pg_more_cal_d} />
            <p className="farm-note" style={{ marginBottom: '1rem' }}>{t.pg_cal_model_note}</p>
            {recommended ? (
              <p className="farm-note" style={{ marginBottom: '1rem' }}>
                {t.pg_cal_last}: {recommended}
                {matchIdx < 0 ? ` — ${t.pg_cal_no_timeline}` : ''}
              </p>
            ) : null}

            {/* Month Selector */}
            <div style={{ background: '#FFF', borderRadius: '1rem', padding: '1.25rem', border: '1px solid rgba(0,0,0,0.07)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>Select Month</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{activeCropsInMonth.length} crops active in {months[selMonth]}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: '0.4rem' }}>
                    {months.map((m, i) => (
                        <button key={i} onClick={() => setSelMonth(i)} style={{
                            background: selMonth === i ? getMonthColor(i) : `${getMonthColor(i)}10`,
                            color: selMonth === i ? 'white' : getMonthColor(i),
                            border: `1px solid ${selMonth === i ? getMonthColor(i) : getMonthColor(i) + '30'}`,
                            borderRadius: '0.6rem', padding: '0.5rem 0.2rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
                        }}>{m}</button>
                    ))}
                </div>
            </div>

            {/* Crop Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                {crops.map((c, i) => (
                    <button key={i} onClick={() => setSelCrop(i)} style={{
                        background: selCrop === i ? c.color : '#FFF',
                        color: selCrop === i ? '#FFF' : '#333',
                        border: `1px solid ${selCrop === i ? c.color : '#DDD'}`,
                        borderRadius: '0.75rem', padding: '0.5rem 0.9rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem'
                    }}>{c.emoji} {c.name}</button>
                ))}
            </div>

            {/* Main Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(350px,1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* Timeline */}
                <div style={{ background: '#FFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.2rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>{crop.emoji}</span>
                        <div>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>{crop.name} Growth Timeline</h3>
                            <span style={{ fontSize: '0.78rem', color: crop.color, fontWeight: 700 }}>{crop.season} Season</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {crop.stages.map((stg, i) => (
                            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                                onClick={() => setSelMonth(stg.month)}
                                style={{
                                    display: 'flex', gap: '1rem', alignItems: 'flex-start', padding: '0.85rem', borderRadius: '0.75rem', cursor: 'pointer',
                                    background: stg.month === selMonth ? `${crop.color}10` : '#F9FAFB',
                                    border: `1px solid ${stg.month === selMonth ? crop.color + '30' : '#E5E7EB'}`
                                }}>
                                <div style={{
                                    minWidth: '45px', height: '45px', borderRadius: '0.6rem',
                                    background: stg.month === selMonth ? crop.color : '#E5E7EB',
                                    color: stg.month === selMonth ? 'white' : '#666',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800
                                }}>{months[stg.month]}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-heading)' }}>{stg.stage}</div>
                                    <p style={{ fontSize: '0.78rem', color: '#555', margin: '0.2rem 0 0 0', lineHeight: 1.4 }}>{stg.tip}</p>
                                </div>
                                {stg.month === selMonth && <CheckCircle size={18} color={crop.color} style={{ flexShrink: 0, marginTop: '2px' }} />}
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Right Column */}
                <div>
                    {/* Stage Detail Banner */}
                    <div style={{
                        background: `linear-gradient(135deg,${crop.color}E0,${crop.color}90)`,
                        borderRadius: '1rem', padding: '1.75rem', color: 'white',
                        boxShadow: `0 8px 25px ${crop.color}30`, marginBottom: '1.5rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.6rem', borderRadius: '1rem', width: 'fit-content', marginBottom: '0.75rem' }}>
                            <Sprout size={14} /> {months[selMonth]} — Activity Guide
                        </div>
                        {activeStage ? (
                            <>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>{crop.emoji} {activeStage.stage}</h2>
                                <p style={{ opacity: 0.95, fontSize: '0.92rem', lineHeight: 1.6, margin: 0 }}>{activeStage.tip}</p>
                            </>
                        ) : (
                            <div>
                                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>No Activity for {crop.name}</h2>
                                <p style={{ opacity: 0.9, fontSize: '0.88rem', margin: 0 }}>{crop.name} is not active during {months[selMonth]}. Check other crops below.</p>
                            </div>
                        )}
                    </div>

                    {/* Active Crops This Month */}
                    <div style={{ background: '#FFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1rem 0' }}>
                            🗓️ All Crops Active in {months[selMonth]}
                        </h3>
                        {activeCropsInMonth.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {activeCropsInMonth.map((c, i) => {
                                    const stg = c.stages.find(s => s.month === selMonth);
                                    return (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '0.6rem', background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '1.2rem' }}>{c.emoji}</span>
                                                <div>
                                                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-heading)' }}>{c.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#666' }}>{stg?.stage}</div>
                                                </div>
                                            </div>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 800, background: `${c.color}15`, color: c.color, padding: '0.2rem 0.5rem', borderRadius: '0.4rem' }}>{c.season}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : <p style={{ fontSize: '0.85rem', color: '#888', textAlign: 'center', padding: '1rem 0' }}>No tracked crops active in {months[selMonth]}</p>}
                    </div>

                    {/* Rotation Tip */}
                    <div style={{ marginTop: '1.5rem', background: '#F0FDF4', borderRadius: '1rem', padding: '1.25rem', border: '1px solid #BBF7D0' }}>
                        <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#166534', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Leaf size={16} /> Crop Rotation Tip
                        </h4>
                        <p style={{ fontSize: '0.82rem', color: '#14532D', lineHeight: 1.5, margin: 0 }}>
                            After harvesting {crop.name}, consider planting a leguminous crop ({crop.season === 'Kharif' ? 'Chickpea or Mustard' : 'Moong or Groundnut'}) to restore soil nitrogen naturally and break pest cycles.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
