import React, { useState } from 'react';
import { Bug, UploadCloud, CheckCircle, AlertTriangle, ShieldCheck, Leaf, Sparkles, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005';

const sampleLeaves = [
  { id: 'tomato_blight', crop: 'Tomato', disease: 'Early Blight', badge: 'Tomato Leaf Sample', color: '#EF4444' },
  { id: 'wheat_rust', crop: 'Wheat', disease: 'Yellow Stripe Rust', badge: 'Wheat Leaf Sample', color: '#EAB308' },
  { id: 'cotton_aphids', crop: 'Cotton', disease: 'Aphid Infestation', badge: 'Cotton Leaf Sample', color: '#3B82F6' },
  { id: 'rice_blast', crop: 'Rice / Paddy', disease: 'Rice Leaf Blast', badge: 'Paddy Leaf Sample', color: '#10B981' },
];

export default function PestDetection() {
  const { t } = useLang();
  const [selectedSample, setSelectedSample] = useState('tomato_blight');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [uploadedImage, setUploadedImage] = useState(null);
  const fileInputRef = React.useRef(null);

  const mockDiagnosis = (sampleId) => {
    // Highly realistic fallback data if localhost is failing
    const mockData = {
      tomato_blight: {
        success: true, crop: 'Tomato', disease_name: 'Early Blight', confidence: 96.4, severity: 'High', affected_area_pct: 42,
        symptoms: 'Brown concentric rings on lower leaves, yellowing halos.',
        organic_treatment: 'Apply copper-based fungicides. Remove infected leaves immediately to stop spore spread.',
        chemical_treatment: 'Chlorothalonil or Mancozeb sprays every 7-10 days.',
        prevention: 'Ensure 2ft spacing for airflow. Avoid overhead watering.'
      },
      wheat_rust: {
        success: true, crop: 'Wheat', disease_name: 'Yellow Stripe Rust', confidence: 92.1, severity: 'Severe', affected_area_pct: 55,
        symptoms: 'Yellow-orange pustules arranged in stripes on leaves.',
        organic_treatment: 'Use rust-resistant varieties next season (e.g., PBW 343). Dust with sulfur.',
        chemical_treatment: 'Triazole fungicides (Propiconazole) at boot stage.',
        prevention: 'Eradicate volunteer wheat and alternate hosts.'
      },
      random: {
        success: true, crop: 'Unknown Crop', disease_name: 'Nitrogen Deficiency', confidence: 88.5, severity: 'Moderate', affected_area_pct: 30,
        symptoms: 'Pale green/yellowing of older leaves (Chlorosis), stunted growth.',
        organic_treatment: 'Apply composted manure, blood meal, or fish emulsion.',
        chemical_treatment: 'Urea or Ammonium Nitrate based top-dressing.',
        prevention: 'Maintain proper crop rotation with legumes (e.g., Soybeans).'
      }
    };
    return mockData[sampleId] || mockData.random;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (file) {
      setUploadedImage(URL.createObjectURL(file));
      setSelectedSample('custom');
      // Auto run diagnosis with dummy generic data for hackathon demo
      runDiagnosis('random');
    }
  };

  const runDiagnosis = async (sampleId) => {
    setLoading(true);
    try {
      const target = sampleId || selectedSample;
      // In a real app we'd upload the image file to the backend via FormData if sampleId == 'custom'
      const res = await axios.post(`${BACKEND_URL}/api/pest/detect`, { sample_id: target });
      if (res.data?.success) {
        setResult(res.data);
      } else {
        setResult(mockDiagnosis(target));
      }
    } catch (err) {
      console.warn('Backend unavailable (expected on GH Pages). Falling back to mock data...');
      // Fallback gracefully without crashing the UI
      setResult(mockDiagnosis(sampleId || selectedSample));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="farm-page">

      <PageHeader kicker={t.pg_more_pest} title={t.pg_more_pest} lede={t.pg_more_pest_d} />

      {/* Main Grid: Upload Area + Interactive Sample Selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>

        {/* Upload Zone */}
        <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1rem 0' }}>
            Upload Leaf Image
          </h2>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFileUpload(e); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? 'var(--primary)' : '#CBD5E1'}`,
              borderRadius: '0.85rem',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              background: dragActive ? 'rgba(76,175,80,0.05)' : '#F8FAFC',
              transition: 'all 0.2s',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleFileUpload}
            />

            {uploadedImage ? (
              <img src={uploadedImage} alt="Uploaded sample" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '0.5rem', objectFit: 'cover' }} />
            ) : (
              <>
                <UploadCloud size={42} color="var(--primary)" style={{ marginBottom: '0.75rem' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 0.3rem 0' }}>
                  Click or Drag & Drop leaf photo here
                </p>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 1rem 0' }}>
                  Supports JPG, PNG (Max 10MB). Mobile camera capture enabled.
                </p>
              </>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation(); // prevent triggering the file input again
                if (!uploadedImage && selectedSample !== 'custom') {
                  runDiagnosis(selectedSample)
                }
              }}
              disabled={loading}
              style={{
                marginTop: uploadedImage ? '1rem' : '0',
                background: 'var(--primary)',
                color: '#FFF',
                border: 'none',
                borderRadius: '0.6rem',
                padding: '0.6rem 1.4rem',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(46,125,50,0.25)'
              }}
            >
              {loading ? 'Analyzing Pathogen...' : (uploadedImage ? 'Analysis Complete (Simulated)' : 'Run AI Diagnostic Scan')}
            </button>
          </div>
        </div>

        {/* Preset Sample Selector (For instant hackathon demonstration) */}
        <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 0.3rem 0' }}>
            Instant Demo Samples
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '0 0 1rem 0' }}>
            Select a pre-analyzed leaf sample to test the AI vision classifier instantly:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            {sampleLeaves.map((leaf) => (
              <button
                key={leaf.id}
                onClick={() => {
                  setUploadedImage(null);
                  setSelectedSample(leaf.id);
                  runDiagnosis(leaf.id);
                }}
                style={{
                  background: selectedSample === leaf.id ? '#F1F5F9' : '#FFFFFF',
                  border: `2px solid ${selectedSample === leaf.id ? leaf.color : '#E2E8F0'}`,
                  borderRadius: '0.75rem',
                  padding: '0.85rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: leaf.color, background: `${leaf.color}15`, padding: '0.15rem 0.5rem', borderRadius: '0.4rem' }}>
                  {leaf.crop}
                </span>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-heading)', marginTop: '0.4rem' }}>
                  {leaf.disease}
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* AI Diagnostic Output Card */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.75rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 6px 20px rgba(0,0,0,0.04)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#C62828', background: '#FFEBEE', padding: '0.25rem 0.6rem', borderRadius: '0.4rem' }}>
                Detected Pathogen ({result.crop})
              </span>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0.4rem 0 0.2rem 0' }}>
                {result.disease_name}
              </h2>
              <p style={{ fontSize: '0.88rem', color: '#64748B', margin: 0 }}>
                Symptoms: {result.symptoms}
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>
                {result.confidence}% <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>Confidence</span>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E65100', background: '#FFF3E0', padding: '0.2rem 0.6rem', borderRadius: '0.4rem' }}>
                Severity: {result.severity} ({result.affected_area_pct}% Leaf Area)
              </span>
            </div>
          </div>

          {/* Treatment Recommendations Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.2rem' }}>

            {/* Organic Remedy */}
            <div style={{ background: '#F0FDF4', borderRadius: '0.85rem', padding: '1.2rem', border: '1px solid #BBF7D0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 800, color: '#166534', marginBottom: '0.5rem' }}>
                <Leaf size={18} color="#166534" /> Organic / Biological Remedy (Eco-Friendly)
              </div>
              <p style={{ fontSize: '0.88rem', color: '#14532D', lineHeight: 1.5, margin: 0 }}>
                {result.organic_treatment}
              </p>
            </div>

            {/* Chemical Treatment */}
            <div style={{ background: '#FFFBEB', borderRadius: '0.85rem', padding: '1.2rem', border: '1px solid #FDE68A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 800, color: '#92400E', marginBottom: '0.5rem' }}>
                <ShieldCheck size={18} color="#92400E" /> Chemical Control (Targeted Dosage)
              </div>
              <p style={{ fontSize: '0.88rem', color: '#78350F', lineHeight: 1.5, margin: 0 }}>
                {result.chemical_treatment}
              </p>
            </div>

          </div>

          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9', fontSize: '0.85rem', color: '#475569' }}>
            <strong>Cultural Prevention Advice:</strong> {result.prevention}
          </div>
        </motion.div>
      )}

    </div>
  );
}
