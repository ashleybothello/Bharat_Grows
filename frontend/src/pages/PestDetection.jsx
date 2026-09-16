import React, { useEffect, useRef, useState } from 'react';
import { UploadCloud, ShieldCheck, Leaf } from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';
import { detectPestFromImage, pestErrorMessage } from '../utils/api';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPE = /^(image\/jpeg|image\/jpg|image\/png)$/i;
const ALLOWED_EXT = /\.(jpe?g|png)$/i;

const sampleLeaves = [
  { id: 'tomato_blight', crop: 'Tomato', disease: 'Early Blight', color: '#EF4444' },
  { id: 'wheat_rust', crop: 'Wheat', disease: 'Yellow Stripe Rust', color: '#EAB308' },
  { id: 'cotton_aphids', crop: 'Cotton', disease: 'Aphid Infestation', color: '#3B82F6' },
  { id: 'rice_blast', crop: 'Rice / Paddy', disease: 'Rice Leaf Blast', color: '#10B981' },
];

const sampleInsects = [
  { id: 'fall_armyworm', crop: 'Maize', disease: 'Fall Armyworm', color: '#7C2D12' },
  { id: 'brown_hopper', crop: 'Rice', disease: 'Brown Planthopper', color: '#1D4ED8' },
  { id: 'pod_borer', crop: 'Chickpea', disease: 'Pod Borer', color: '#6D28D9' },
  { id: 'whitefly', crop: 'Cotton', disease: 'Whitefly', color: '#0F766E' },
];

const DEMO_CATALOG = {
  tomato_blight: {
    source: 'demo',
    crop: 'Tomato',
    disease_name: 'Early Blight (Alternaria solani)',
    confidence: 96.4,
    severity: 'Moderate (Level 2/4)',
    affected_area_pct: 18,
    symptoms: 'Concentric brown spots with yellow halo surrounding the leaves.',
    organic_treatment: 'Spray Neem Seed Kernel Extract (NSKE 5%) or Trichoderma viride bio-fungicide every 7 days.',
    chemical_treatment: 'Mancozeb 75% WP @ 2g/liter or Azoxystrobin 23% SC @ 1ml/liter water.',
    prevention: 'Ensure proper plant spacing for air circulation and avoid overhead foliar watering.',
  },
  wheat_rust: {
    source: 'demo',
    crop: 'Wheat',
    disease_name: 'Yellow Stripe Rust (Puccinia striiformis)',
    confidence: 94.8,
    severity: 'Severe (Level 3/4)',
    affected_area_pct: 32,
    symptoms: 'Yellow pustules arranged in linear stripes along the leaf veins.',
    organic_treatment: 'Apply fermented sour buttermilk solution (1 liter in 10 liters water) + Panchagavya spray.',
    chemical_treatment: 'Propiconazole 25% EC @ 1ml/liter or Tebuconazole 50% + Trifloxystrobin 25% WG @ 0.7g/liter.',
    prevention: 'Plant resistant cultivars like HD-3086 or DBW-187 and destroy alternate host weeds.',
  },
  cotton_aphids: {
    source: 'demo',
    crop: 'Cotton',
    disease_name: 'Cotton Aphid Infestation (Aphis gossypii)',
    confidence: 98.1,
    severity: 'Mild (Level 1/4)',
    affected_area_pct: 12,
    symptoms: 'Curled leaves with sticky honeydew secretions and black sooty mold growth.',
    organic_treatment: 'Spray Verticillium lecanii bio-insecticide @ 5g/liter or 2% Neem oil solution with soap.',
    chemical_treatment: 'Imidacloprid 17.8% SL @ 0.5ml/liter or Acetamiprid 20% SP @ 0.2g/liter.',
    prevention: 'Install yellow sticky traps (15 traps/acre) and release Ladybird beetles (predatory natural enemies).',
  },
  rice_blast: {
    source: 'demo',
    crop: 'Rice / Paddy',
    disease_name: 'Rice Leaf Blast (Magnaporthe oryzae)',
    confidence: 95.2,
    severity: 'High (Level 3/4)',
    affected_area_pct: 28,
    symptoms: 'Spindle-shaped elliptical lesions with grey/white centers and reddish-brown margins.',
    organic_treatment: 'Foliar application of Pseudomonas fluorescens @ 10g/liter or Kasugamycin bio-antibiotic.',
    chemical_treatment: 'Tricyclazole 75% WP @ 0.6g/liter or Isoprothiolane 40% EC @ 1.5ml/liter.',
    prevention: 'Avoid excess split doses of nitrogenous fertilizers and maintain field water level.',
  },
};

const DEMO_INSECTS = {
  fall_armyworm: {
    source: 'demo',
    kind: 'insect',
    crop: 'Maize',
    disease_name: 'Fall Armyworm (Spodoptera frugiperda)',
    confidence: 96.1,
    severity: 'Walkthrough sample only',
    symptoms: 'Larvae feed on maize whorls and leaves. Confirm in the field before any control decision.',
    organic_treatment: 'Consider neem-based sprays or recommended biocontrol only after local expert advice.',
    chemical_treatment: 'Do not apply a guessed insecticide dose from this demo.',
    prevention: 'Scout regularly. Use pheromone traps where advised by local extension.',
  },
  brown_hopper: {
    source: 'demo',
    kind: 'insect',
    crop: 'Rice',
    disease_name: 'Brown Planthopper (Nilaparvata lugens)',
    confidence: 94.4,
    severity: 'Walkthrough sample only',
    symptoms: 'Hoppers suck sap from the base of rice plants. This card is a demo, not an AI scan.',
    organic_treatment: 'Avoid unnecessary sprays. Natural enemies often help if insecticides are not overused.',
    chemical_treatment: 'Exact insecticide choice and dose must follow a local recommendation, not this demo.',
    prevention: 'Avoid excessive nitrogen and continuous rice cropping where hopper outbreaks are known.',
  },
  pod_borer: {
    source: 'demo',
    kind: 'insect',
    crop: 'Chickpea',
    disease_name: 'Pod Borer (Helicoverpa armigera)',
    confidence: 95.7,
    severity: 'Walkthrough sample only',
    symptoms: 'Larvae bore into pods. This is a labelled demo sample, not a live identification.',
    organic_treatment: 'Consider Helicoverpa NPV or neem where locally recommended.',
    chemical_treatment: 'Do not treat this demo as a spray schedule.',
    prevention: 'Monitor flowers and young pods. Follow local IPM guidance.',
  },
  whitefly: {
    source: 'demo',
    kind: 'insect',
    crop: 'Cotton',
    disease_name: 'Whitefly (Bemisia tabaci)',
    confidence: 97.2,
    severity: 'Walkthrough sample only',
    symptoms: 'Tiny white insects on the underside of leaves, often with sooty mold. Demo only.',
    organic_treatment: 'Yellow sticky traps and neem oil may help as part of IPM.',
    chemical_treatment: 'Confirm the pest and follow a soil-test / extension recommendation. This demo has no dose.',
    prevention: 'Avoid broad-spectrum sprays that kill natural enemies.',
  },
};

function isAllowedFile(file) {
  if (!file) return false;
  const type = String(file.type || '');
  const name = String(file.name || '');
  return ALLOWED_TYPE.test(type) || ALLOWED_EXT.test(name);
}

function viewFromResult(result) {
  if (!result) return null;
  const insectScan = result.kind === 'insect' || result.source === 'kindwise_insect_id' || Boolean(result.insect);
  if (result.source === 'demo') {
    return {
      isDemo: true,
      scanKind: insectScan || result.kind === 'insect' ? 'insect' : 'leaf',
      crop: result.crop || null,
      disease: result.disease_name || null,
      confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : null,
      isHealthy: null,
      category: null,
      description: result.symptoms || null,
      organic: result.organic_treatment || null,
      chemical: result.chemical_treatment || null,
      prevention: result.prevention || null,
      severity: result.severity || null,
      affectedArea: Number.isFinite(Number(result.affected_area_pct)) ? Number(result.affected_area_pct) : null,
      alternatives: null,
      model: null,
    };
  }
  if (insectScan) {
    const insect = result.insect || {};
    const treatment = insect.treatment || {};
    return {
      isDemo: false,
      scanKind: 'insect',
      crop: Array.isArray(insect.common_names) ? insect.common_names[0] : null,
      disease: insect.name || null,
      confidence: Number.isFinite(Number(insect.confidence_pct)) ? Number(insect.confidence_pct) : null,
      isHealthy: null,
      category: insect.category || null,
      description: insect.description || null,
      organic: treatment.biological || null,
      chemical: treatment.chemical || null,
      prevention: treatment.prevention || null,
      severity: insect.severity || null,
      affectedArea: null,
      alternatives: Array.isArray(result.alternatives) ? result.alternatives : null,
      model: result.model || null,
    };
  }
  const disease = result.disease || {};
  const crop = result.crop || {};
  const treatment = disease.treatment || {};
  return {
    isDemo: false,
    scanKind: 'leaf',
    crop: crop.name || null,
    disease: disease.name || null,
    confidence: Number.isFinite(Number(disease.confidence_pct)) ? Number(disease.confidence_pct) : (Number.isFinite(Number(crop.confidence_pct)) ? Number(crop.confidence_pct) : null),
    isHealthy: typeof result.is_healthy === 'boolean' ? result.is_healthy : null,
    category: disease.category || crop.category || null,
    description: disease.description || disease.symptoms || crop.description || null,
    organic: treatment.biological || null,
    chemical: treatment.chemical || null,
    prevention: treatment.prevention || null,
    severity: disease.severity || null,
    affectedArea: null,
    alternatives: Array.isArray(result.alternatives) ? result.alternatives : null,
    model: result.model || null,
  };
}

export default function PestDetection() {
  const { t } = useLang();
  const [selectedSample, setSelectedSample] = useState('tomato_blight');
  const [scanKind, setScanKind] = useState('leaf');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const setPreview = (file) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setUploadedImage(url);
    setImageFile(file);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file) {
      setError(t.pg_pest_err_no_image);
      return;
    }
    if (!isAllowedFile(file)) {
      setError(scanKind === 'insect' ? t.pg_pest_err_invalid_insect : t.pg_pest_err_invalid);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t.pg_pest_err_large);
      return;
    }
    setError('');
    setResult(null);
    setSelectedSample('custom');
    setPreview(file);
  };

  const runAiScan = async (event) => {
    event?.stopPropagation?.();
    if (!imageFile) {
      setError(t.pg_pest_err_no_image);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await detectPestFromImage(imageFile, scanKind);
      if (data?.success) {
        setResult(data);
      } else {
        setError(scanKind === 'insect' ? t.pg_pest_err_unrecognized_insect : t.pg_pest_err_unrecognized);
      }
    } catch (err) {
      setError(pestErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const showDemo = (leafId) => {
    setUploadedImage(null);
    setImageFile(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setSelectedSample(leafId);
    setError('');
    setResult(scanKind === 'insect' ? (DEMO_INSECTS[leafId] || null) : (DEMO_CATALOG[leafId] || null));
  };

  const switchKind = (next) => {
    if (next === scanKind) return;
    setScanKind(next);
    setError('');
    setResult(null);
    setSelectedSample(next === 'insect' ? 'fall_armyworm' : 'tomato_blight');
  };

  const view = viewFromResult(result);
  const canScan = Boolean(imageFile) && !loading;
  const samples = scanKind === 'insect' ? sampleInsects : sampleLeaves;
  const insectMode = scanKind === 'insect';

  return (
    <div className="farm-page">

      <PageHeader kicker={t.pg_more_pest} title={t.pg_more_pest} lede={insectMode ? t.pg_pest_lede_insect : t.pg_more_pest_d} />

      <div className="pest-mode-row">
        <button
          type="button"
          className="pest-mode-btn"
          onClick={() => switchKind('leaf')}
          style={{
            border: `1px solid ${scanKind === 'leaf' ? 'var(--primary)' : '#E2E8F0'}`,
            background: scanKind === 'leaf' ? '#ECFDF3' : '#FFFFFF',
            color: '#14532D',
          }}
        >
          {t.pg_pest_mode_leaf}
        </button>
        <button
          type="button"
          className="pest-mode-btn"
          onClick={() => switchKind('insect')}
          style={{
            border: `1px solid ${scanKind === 'insect' ? 'var(--primary)' : '#E2E8F0'}`,
            background: scanKind === 'insect' ? '#ECFDF3' : '#FFFFFF',
            color: '#14532D',
          }}
        >
          {t.pg_pest_mode_insect}
        </button>
      </div>

      <div className="bg-fluid-grid" style={{ marginBottom: '2rem' }}>

        {/* Upload Zone */}
        <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1rem 0' }}>
            {insectMode ? t.pg_pest_upload_insect : t.pg_pest_upload}
          </h2>

          <div
            className="pest-drop"
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
              accept="image/jpeg,image/png,.jpg,.jpeg,.png,image/*"
              onChange={handleFileUpload}
            />

            {uploadedImage ? (
              <img src={uploadedImage} alt="" className="pest-preview" />
            ) : (
              <>
                <UploadCloud size={42} color="var(--primary)" style={{ marginBottom: '0.75rem' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 0.3rem 0' }}>
                  {insectMode ? t.pg_pest_drop_insect : t.pg_pest_drop}
                </p>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 1rem 0' }}>
                  {insectMode ? t.pg_pest_hint_insect : t.pg_pest_hint}
                </p>
              </>
            )}

            <button
              type="button"
              className="pest-scan-btn"
              onClick={runAiScan}
              disabled={!canScan}
              style={{
                marginTop: uploadedImage ? '1rem' : '0',
                background: canScan ? 'var(--primary)' : '#94A3B8',
                color: '#FFF',
                cursor: canScan ? 'pointer' : 'not-allowed',
                boxShadow: canScan ? '0 4px 12px rgba(46,125,50,0.25)' : 'none'
              }}
            >
              {loading ? (insectMode ? t.pg_pest_scanning_insect : t.pg_pest_scanning) : (insectMode ? t.pg_pest_scan_insect : t.pg_pest_scan)}
            </button>
          </div>
        </div>

        {/* Preset Sample Selector (For instant hackathon demonstration) */}
        <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 0.3rem 0' }}>
            {t.pg_pest_demo}
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '0 0 1rem 0' }}>
            {t.pg_pest_demo_p}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            {samples.map((leaf) => (
              <button
                key={leaf.id}
                onClick={() => showDemo(leaf.id)}
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

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: '0.85rem', padding: '0.9rem 1.1rem', marginBottom: '1.25rem', fontSize: '0.9rem', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {view && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.75rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 6px 20px rgba(0,0,0,0.04)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: view.isDemo ? '#92400E' : '#0F766E', background: view.isDemo ? '#FFF7ED' : '#CCFBF1', padding: '0.25rem 0.6rem', borderRadius: '0.4rem', marginRight: '0.4rem' }}>
                {view.isDemo ? t.pg_pest_demo_badge : t.pg_pest_ai_badge}
              </span>
              {view.disease && (
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#C62828', background: '#FFEBEE', padding: '0.25rem 0.6rem', borderRadius: '0.4rem' }}>
                  {view.scanKind === 'insect' ? t.pg_pest_detected_insect : t.pg_pest_detected}{view.crop ? ` (${view.crop})` : ''}
                </span>
              )}
              {!view.disease && view.crop && (
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#166534', background: '#DCFCE7', padding: '0.25rem 0.6rem', borderRadius: '0.4rem' }}>
                  {view.crop}
                </span>
              )}
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0.4rem 0 0.2rem 0' }}>
                {view.disease || view.crop || (view.scanKind === 'insect' ? t.pg_pest_no_insect : t.pg_pest_no_disease)}
              </h2>
              {view.description && (
                <p style={{ fontSize: '0.88rem', color: '#64748B', margin: 0 }}>
                  {view.description}
                </p>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              {view.confidence != null && (
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {view.confidence}% <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>{t.pg_pest_confidence}</span>
                </div>
              )}
              {view.isHealthy != null && (
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: view.isHealthy ? '#166534' : '#9A3412', marginTop: '0.35rem' }}>
                  {t.pg_pest_is_healthy}: {view.isHealthy ? t.pg_pest_yes : t.pg_pest_no}
                </div>
              )}
              {view.category && (
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>
                  {t.pg_pest_category}: {view.category}
                </div>
              )}
              {view.isDemo && view.severity && (
                <span style={{ display: 'inline-block', marginTop: '0.35rem', fontSize: '0.8rem', fontWeight: 700, color: '#E65100', background: '#FFF3E0', padding: '0.2rem 0.6rem', borderRadius: '0.4rem' }}>
                  {view.severity}{view.affectedArea != null ? ` (${view.affectedArea}% Leaf Area)` : ''}
                </span>
              )}
            </div>
          </div>

          {(view.organic || view.chemical) && (
            <div className="bg-fluid-grid" style={{ gap: '1.2rem' }}>
              {view.organic && (
                <div style={{ background: '#F0FDF4', borderRadius: '0.85rem', padding: '1.2rem', border: '1px solid #BBF7D0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 800, color: '#166534', marginBottom: '0.5rem' }}>
                    <Leaf size={18} color="#166534" /> {t.pg_pest_organic}
                  </div>
                  <p style={{ fontSize: '0.88rem', color: '#14532D', lineHeight: 1.5, margin: 0 }}>
                    {view.organic}
                  </p>
                </div>
              )}

              {view.chemical && (
                <div style={{ background: '#FFFBEB', borderRadius: '0.85rem', padding: '1.2rem', border: '1px solid #FDE68A' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 800, color: '#92400E', marginBottom: '0.5rem' }}>
                    <ShieldCheck size={18} color="#92400E" /> {t.pg_pest_chemical}
                  </div>
                  <p style={{ fontSize: '0.88rem', color: '#78350F', lineHeight: 1.5, margin: 0 }}>
                    {view.chemical}
                  </p>
                </div>
              )}
            </div>
          )}

          {view.prevention && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9', fontSize: '0.85rem', color: '#475569' }}>
              <strong>{t.pg_pest_prevention}:</strong> {view.prevention}
            </div>
          )}

          {view.alternatives?.length > 0 && (
            <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#475569' }}>
              <strong>{t.pg_pest_alt}:</strong>{' '}
              {view.alternatives.map((alt) => {
                const pct = Number.isFinite(Number(alt.confidence_pct)) ? ` (${alt.confidence_pct}%)` : '';
                return `${alt.name}${pct}`;
              }).join(' · ')}
            </div>
          )}

          {!view.isDemo && view.model && (view.model.product || view.model.version) && (
            <div style={{ marginTop: '0.85rem', fontSize: '0.8rem', color: '#64748B' }}>
              {t.pg_pest_model}: {[view.model.product, view.model.version].filter(Boolean).join(' · ')}
            </div>
          )}
        </motion.div>
      )}

    </div>
  );
}
