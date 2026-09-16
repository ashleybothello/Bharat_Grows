import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Loader2, RotateCcw, Cpu, ChevronDown, AlertTriangle } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { requestCropDecision, mlErrorMessage } from '../utils/api';
import { fetchAnalysisInput, fetchNodes } from '../utils/telemetry';
import { saveLatestAnalysis } from '../utils/latestAnalysis';
import { completeAction, emitPageGone, emitPageReady, sleep, subscribeSaathi } from '../utils/saathi/bus';
import DataBadge from '../components/DataBadge';
import PageHeader from '../components/PageHeader';
import { cropLabel, qualityLabel } from './dashboard/helpers';

function resolveCoords(farmer, nodes, sourceScope, sourceNode) {
  if (sourceScope === 'node') {
    const node = nodes.find((n) => n.nodeId === sourceNode);
    const lat = Number(node?.coordinates?.latitude);
    const lon = Number(node?.coordinates?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { latitude: lat, longitude: lon };
    }
  }
  const lat = Number(farmer?.profile?.latitude);
  const lon = Number(farmer?.profile?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { latitude: lat, longitude: lon };
  }
  return {};
}

// Average soil & environment values for common Indian crops (from agricultural research data)
const cropPresets = {
  '': { label: 'Select a crop to auto-fill...', n: 50, p: 25, k: 40, ph: 6.5, moisture: 50, temperature: 25, humidity: 60, rainfall: 100 },
  // ━━━ Original 22 Crops ━━━
  rice:       { label: '🌾 Rice',         n: 80,  p: 48,  k: 40,  ph: 6.5, moisture: 70, temperature: 24, humidity: 82, rainfall: 236 },
  wheat:      { label: '🌾 Wheat',        n: 95,  p: 60,  k: 45,  ph: 6.8, moisture: 50, temperature: 20, humidity: 55, rainfall: 85 },
  maize:      { label: '🌽 Maize',        n: 77,  p: 48,  k: 20,  ph: 6.2, moisture: 55, temperature: 23, humidity: 65, rainfall: 85 },
  cotton:     { label: '🧶 Cotton',       n: 120, p: 40,  k: 20,  ph: 7.0, moisture: 40, temperature: 30, humidity: 65, rainfall: 80 },
  sugarcane:  { label: '🎋 Sugarcane',    n: 115, p: 45,  k: 60,  ph: 6.5, moisture: 60, temperature: 30, humidity: 72, rainfall: 200 },
  jute:       { label: '🧵 Jute',         n: 80,  p: 40,  k: 40,  ph: 7.0, moisture: 70, temperature: 27, humidity: 85, rainfall: 175 },
  coffee:     { label: '☕ Coffee',       n: 100, p: 20,  k: 30,  ph: 6.0, moisture: 55, temperature: 25, humidity: 70, rainfall: 175 },
  tea:        { label: '🍵 Tea',          n: 80,  p: 32,  k: 30,  ph: 5.2, moisture: 65, temperature: 23, humidity: 82, rainfall: 225 },
  mango:      { label: '🥭 Mango',       n: 20,  p: 25,  k: 30,  ph: 5.8, moisture: 45, temperature: 31, humidity: 50, rainfall: 100 },
  banana:     { label: '🍌 Banana',       n: 100, p: 75,  k: 50,  ph: 6.0, moisture: 60, temperature: 27, humidity: 80, rainfall: 105 },
  pomegranate:{ label: '🍎 Pomegranate',  n: 20,  p: 10,  k: 40,  ph: 6.5, moisture: 35, temperature: 34, humidity: 45, rainfall: 55 },
  grapes:     { label: '🍇 Grapes',       n: 25,  p: 65,  k: 200, ph: 6.0, moisture: 40, temperature: 32, humidity: 60, rainfall: 70 },
  apple:      { label: '🍎 Apple',        n: 20,  p: 130, k: 200, ph: 6.0, moisture: 55, temperature: 22, humidity: 90, rainfall: 110 },
  coconut:    { label: '🥥 Coconut',      n: 20,  p: 10,  k: 30,  ph: 5.8, moisture: 50, temperature: 27, humidity: 95, rainfall: 175 },
  papaya:     { label: '🍈 Papaya',       n: 50,  p: 55,  k: 50,  ph: 6.5, moisture: 45, temperature: 33, humidity: 65, rainfall: 145 },
  orange:     { label: '🍊 Orange',       n: 20,  p: 10,  k: 10,  ph: 7.0, moisture: 40, temperature: 25, humidity: 75, rainfall: 110 },
  chickpea:   { label: '🫘 Chickpea',     n: 40,  p: 60,  k: 80,  ph: 7.0, moisture: 30, temperature: 18, humidity: 35, rainfall: 75 },
  lentil:     { label: '🫘 Lentil',       n: 20,  p: 60,  k: 20,  ph: 6.5, moisture: 35, temperature: 22, humidity: 50, rainfall: 50 },
  watermelon: { label: '🍉 Watermelon',   n: 100, p: 15,  k: 50,  ph: 6.5, moisture: 40, temperature: 30, humidity: 65, rainfall: 50 },
  muskmelon:  { label: '🍈 Muskmelon',    n: 100, p: 15,  k: 50,  ph: 6.5, moisture: 35, temperature: 32, humidity: 60, rainfall: 45 },
  kidneybeans:{ label: '🫘 Kidney Beans', n: 20,  p: 65,  k: 20,  ph: 5.8, moisture: 45, temperature: 20, humidity: 70, rainfall: 115 },
  mothbeans:  { label: '🫘 Moth Beans',   n: 20,  p: 45,  k: 20,  ph: 6.5, moisture: 30, temperature: 30, humidity: 45, rainfall: 45 },
  pigeonpeas: { label: '🫘 Pigeon Peas',  n: 20,  p: 60,  k: 20,  ph: 6.4, moisture: 35, temperature: 28, humidity: 50, rainfall: 140 },
  blackgram:  { label: '🫘 Black Gram',   n: 40,  p: 60,  k: 20,  ph: 7.0, moisture: 40, temperature: 28, humidity: 65, rainfall: 70 },
  mungbean:   { label: '🫘 Mung Bean',    n: 20,  p: 45,  k: 20,  ph: 6.5, moisture: 35, temperature: 28, humidity: 85, rainfall: 45 },
  // ━━━ 15 New India-Specific Crops ━━━
  turmeric:   { label: '🟡 Turmeric',     n: 60,  p: 35,  k: 75,  ph: 6.2, moisture: 55, temperature: 26, humidity: 72, rainfall: 150 },
  ginger:     { label: '🫚 Ginger',       n: 70,  p: 40,  k: 60,  ph: 6.2, moisture: 60, temperature: 25, humidity: 80, rainfall: 215 },
  groundnut:  { label: '🥜 Groundnut',    n: 28,  p: 50,  k: 35,  ph: 6.2, moisture: 40, temperature: 30, humidity: 62, rainfall: 90 },
  soybean:    { label: '🫘 Soybean',      n: 20,  p: 60,  k: 45,  ph: 6.8, moisture: 45, temperature: 27, humidity: 68, rainfall: 105 },
  mustard:    { label: '🌼 Mustard',      n: 70,  p: 40,  k: 28,  ph: 6.9, moisture: 35, temperature: 18, humidity: 52, rainfall: 55 },
  tomato:     { label: '🍅 Tomato',       n: 110, p: 60,  k: 90,  ph: 6.2, moisture: 50, temperature: 24, humidity: 62, rainfall: 90 },
  potato:     { label: '🥔 Potato',       n: 105, p: 70,  k: 115, ph: 5.8, moisture: 55, temperature: 20, humidity: 70, rainfall: 85 },
  onion:      { label: '🧅 Onion',        n: 85,  p: 45,  k: 60,  ph: 6.8, moisture: 45, temperature: 24, humidity: 60, rainfall: 70 },
  chilli:     { label: '🌶️ Chilli',       n: 95,  p: 45,  k: 60,  ph: 6.6, moisture: 50, temperature: 28, humidity: 68, rainfall: 95 },
  cardamom:   { label: '🫛 Cardamom',     n: 58,  p: 35,  k: 90,  ph: 5.8, moisture: 65, temperature: 22, humidity: 85, rainfall: 275 },
  blackpepper:{ label: '⚫ Black Pepper', n: 45,  p: 28,  k: 115, ph: 6.2, moisture: 60, temperature: 27, humidity: 82, rainfall: 275 },
  rubber:     { label: '🌳 Rubber',       n: 35,  p: 25,  k: 35,  ph: 5.2, moisture: 65, temperature: 29, humidity: 85, rainfall: 300 },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Region-Specific Presets — Indian Agro-Climatic Zones
// Data sourced from: ICAR, NBSS&LUP, IMD Climate Normals
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const regionPresets = {
  '': { label: 'Select your region...', desc: '', soil: '', crops: [], n: 50, p: 25, k: 40, ph: 6.5, moisture: 50, temperature: 25, humidity: 60, rainfall: 100 },
  // ━━━ NORTH INDIA ━━━
  'north_punjab': {
    label: '🌾 North — Punjab & Haryana (Indo-Gangetic Plain)',
    desc: 'Fertile alluvial soil, canal-irrigated, extreme summers & cold winters',
    soil: 'Alluvial (Sandy Loam)', crops: ['Wheat', 'Rice', 'Sugarcane', 'Mustard', 'Maize', 'Cotton'],
    n: 90, p: 55, k: 45, ph: 7.2, moisture: 50, temperature: 24, humidity: 55, rainfall: 70,
  },
  'north_up': {
    label: '🌾 North — Uttar Pradesh (Upper Gangetic)',
    desc: 'Rich alluvial plains, monsoon-fed, major sugarcane & wheat belt',
    soil: 'Alluvial (Clay Loam)', crops: ['Sugarcane', 'Wheat', 'Rice', 'Potato', 'Mustard', 'Lentil'],
    n: 95, p: 50, k: 50, ph: 7.0, moisture: 55, temperature: 26, humidity: 60, rainfall: 95,
  },
  'north_himachal': {
    label: '🏔️ North — Himachal Pradesh & Uttarakhand (Himalayan)',
    desc: 'Mountain terrain, acidic soil, cool climate ideal for temperate fruits',
    soil: 'Mountain (Brown Forest)', crops: ['Apple', 'Tea', 'Kidney Beans', 'Potato', 'Ginger', 'Cardamom'],
    n: 30, p: 70, k: 120, ph: 5.8, moisture: 60, temperature: 16, humidity: 75, rainfall: 150,
  },
  // ━━━ SOUTH INDIA ━━━
  'south_kerala': {
    label: '🌴 South — Kerala (Malabar Coast)',
    desc: 'Tropical, very high rainfall, laterite soil, spice & plantation capital',
    soil: 'Laterite (Red)', crops: ['Coconut', 'Rubber', 'Black Pepper', 'Cardamom', 'Tea', 'Banana', 'Ginger'],
    n: 35, p: 20, k: 60, ph: 5.3, moisture: 70, temperature: 27, humidity: 88, rainfall: 300,
  },
  'south_tn': {
    label: '🌾 South — Tamil Nadu (Cauvery Delta)',
    desc: 'Delta irrigation, red & black soil, rice granary of South India',
    soil: 'Alluvial / Red Sandy', crops: ['Rice', 'Sugarcane', 'Banana', 'Turmeric', 'Groundnut', 'Chilli'],
    n: 70, p: 40, k: 50, ph: 6.5, moisture: 55, temperature: 30, humidity: 72, rainfall: 95,
  },
  'south_karnataka': {
    label: '☕ South — Karnataka (Malnad & Coastal)',
    desc: 'Western Ghats slopes, rich biodiversity, coffee & spice plantations',
    soil: 'Laterite / Forest Loam', crops: ['Coffee', 'Cardamom', 'Black Pepper', 'Rice', 'Coconut', 'Rubber'],
    n: 45, p: 25, k: 55, ph: 5.5, moisture: 65, temperature: 24, humidity: 80, rainfall: 250,
  },
  'south_ap': {
    label: '🌶️ South — Andhra Pradesh & Telangana',
    desc: 'Deccan plateau + coastal delta, black cotton & red soil mix',
    soil: 'Black Cotton / Red', crops: ['Rice', 'Chilli', 'Turmeric', 'Cotton', 'Groundnut', 'Onion', 'Mango'],
    n: 80, p: 45, k: 55, ph: 6.8, moisture: 45, temperature: 30, humidity: 65, rainfall: 85,
  },
  // ━━━ WEST INDIA ━━━
  'west_gujarat': {
    label: '🥜 West — Gujarat (Semi-Arid)',
    desc: 'Dry climate, black & sandy soil, major groundnut & cotton belt',
    soil: 'Black Cotton / Sandy', crops: ['Groundnut', 'Cotton', 'Onion', 'Sugarcane', 'Chilli', 'Mango'],
    n: 40, p: 35, k: 45, ph: 7.5, moisture: 30, temperature: 30, humidity: 50, rainfall: 60,
  },
  'west_rajasthan': {
    label: '🏜️ West — Rajasthan (Arid & Semi-Arid)',
    desc: 'Desert & semi-desert, sandy soil, low rainfall, hardy crops only',
    soil: 'Desert Sandy / Arid', crops: ['Mustard', 'Moth Beans', 'Mung Bean', 'Groundnut', 'Watermelon', 'Chickpea'],
    n: 25, p: 30, k: 20, ph: 7.8, moisture: 20, temperature: 33, humidity: 35, rainfall: 35,
  },
  'west_maharashtra': {
    label: '🍇 West — Maharashtra (Deccan Plateau)',
    desc: 'Black basaltic soil, semi-arid interior, sugarcane & grape region',
    soil: 'Black Basaltic (Regur)', crops: ['Sugarcane', 'Grapes', 'Soybean', 'Onion', 'Pomegranate', 'Cotton', 'Chilli'],
    n: 60, p: 40, k: 50, ph: 7.0, moisture: 40, temperature: 28, humidity: 55, rainfall: 75,
  },
  // ━━━ EAST INDIA ━━━
  'east_bengal': {
    label: '🌾 East — West Bengal (Gangetic Delta)',
    desc: 'Fertile delta, heavy monsoon, ideal for rice, jute & potato',
    soil: 'Alluvial (Delta Clay)', crops: ['Rice', 'Jute', 'Potato', 'Mustard', 'Mango', 'Lentil', 'Tea'],
    n: 75, p: 45, k: 40, ph: 6.5, moisture: 65, temperature: 27, humidity: 80, rainfall: 175,
  },
  'east_odisha': {
    label: '🌾 East — Odisha (Coastal & Tribal)',
    desc: 'Coastal alluvial to hilly laterite, rice dominant, turmeric belt',
    soil: 'Laterite / Alluvial', crops: ['Rice', 'Turmeric', 'Groundnut', 'Sugarcane', 'Banana', 'Black Gram'],
    n: 65, p: 35, k: 45, ph: 5.8, moisture: 60, temperature: 28, humidity: 78, rainfall: 155,
  },
  'east_bihar': {
    label: '🥔 East — Bihar & Jharkhand',
    desc: 'Upper Gangetic alluvial, major litchi & maize zone, monsoon-heavy',
    soil: 'Alluvial (Loamy)', crops: ['Rice', 'Wheat', 'Maize', 'Potato', 'Lentil', 'Sugarcane', 'Onion'],
    n: 80, p: 50, k: 45, ph: 6.8, moisture: 55, temperature: 26, humidity: 70, rainfall: 120,
  },
  // ━━━ CENTRAL INDIA ━━━
  'central_mp': {
    label: '🫘 Central — Madhya Pradesh (Black Soil Belt)',
    desc: 'Heart of India, deep black cotton soil, soybean capital',
    soil: 'Black Cotton (Deep Regur)', crops: ['Soybean', 'Wheat', 'Chickpea', 'Cotton', 'Chilli', 'Onion', 'Tomato'],
    n: 55, p: 45, k: 40, ph: 7.2, moisture: 40, temperature: 26, humidity: 55, rainfall: 100,
  },
  'central_cg': {
    label: '🌾 Central — Chhattisgarh (Rice Bowl)',
    desc: 'Red & yellow soil, tribal farming, predominantly rice cultivation',
    soil: 'Red & Yellow Laterite', crops: ['Rice', 'Maize', 'Pigeon Peas', 'Groundnut', 'Sugarcane', 'Ginger'],
    n: 60, p: 30, k: 35, ph: 6.0, moisture: 50, temperature: 27, humidity: 65, rainfall: 130,
  },
  // ━━━ NORTHEAST INDIA ━━━
  'ne_assam': {
    label: '🍵 Northeast — Assam & Meghalaya',
    desc: 'Brahmaputra valley, extremely high rainfall, tea & ginger hub',
    soil: 'Alluvial / Acidic Red', crops: ['Tea', 'Rice', 'Ginger', 'Turmeric', 'Orange', 'Banana', 'Rubber'],
    n: 50, p: 25, k: 35, ph: 5.0, moisture: 75, temperature: 25, humidity: 85, rainfall: 280,
  },
  'ne_nagaland': {
    label: '🌿 Northeast — Nagaland, Mizoram & Manipur',
    desc: 'Hilly terrain, jhum cultivation, very high rainfall, acidic soil',
    soil: 'Mountain Acidic (Red)', crops: ['Rice', 'Ginger', 'Turmeric', 'Chilli', 'Black Pepper', 'Orange'],
    n: 40, p: 20, k: 30, ph: 4.8, moisture: 70, temperature: 22, humidity: 82, rainfall: 250,
  },
  // ━━━ COASTAL / KONKAN ━━━
  'coastal_konkan': {
    label: '🥥 Coastal — Konkan & Goa',
    desc: 'Western coastline, laterite soil, coconut & mango paradise',
    soil: 'Laterite (Sandy)', crops: ['Coconut', 'Mango', 'Rice', 'Banana', 'Black Pepper', 'Papaya'],
    n: 30, p: 20, k: 40, ph: 5.5, moisture: 60, temperature: 28, humidity: 82, rainfall: 280,
  },
};

const Analyze = () => {
  const navigate = useNavigate();
  const { t } = useLang();
  const { farmer } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [activeParam, setActiveParam] = useState(null);
  const [selectedCrop, setSelectedCrop] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [presetApplied, setPresetApplied] = useState('');
  const [sourceScope, setSourceScope] = useState('farm');
  const [sourceNode, setSourceNode] = useState('');
  const [nodes, setNodes] = useState([]);
  const [sensorNote, setSensorNote] = useState('');
  const [usingSensors, setUsingSensors] = useState(false);
  const [rainRecent, setRainRecent] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [rainfallExplicit, setRainfallExplicit] = useState(false);

  const defaults = { n: 50, p: 25, k: 40, ph: 6.5, moisture: 50, temperature: 25, humidity: 60, rainfall: 100 };
  const [formData, setFormData] = useState({ ...defaults });

  const applySensed = (sensed) => {
    if (!sensed) return;
    setFormData((prev) => ({
      ...prev,
      n: sensed.n ?? prev.n,
      p: sensed.p ?? prev.p,
      k: sensed.k ?? prev.k,
      moisture: sensed.moisture ?? prev.moisture,
      temperature: sensed.temperature ?? prev.temperature,
      humidity: sensed.humidity ?? prev.humidity,
    }));
    setUsingSensors(true);
  };

  const loadSensors = async (scope, nodeId) => {
    try {
      const data = await fetchAnalysisInput({ scope, nodeId });
      applySensed(data.sensed);
      setSensorNote(data.sourceLabel || t.pg_az_from_sensors);
      setRainRecent(data.context?.rain_recent_mm ?? null);
      setSnapshot({
        sourceLabel: data.sourceLabel,
        recordedAt: data.recordedAt,
        sensors: data.evaluation?.sensors || {},
        context: data.context || {},
      });
      return data;
    } catch {
      setUsingSensors(false);
      setSensorNote(t.pg_az_sensor_fail);
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pack = await fetchNodes();
        if (cancelled) return;
        setNodes(pack.nodes || []);
      } catch {
        if (!cancelled) setNodes([]);
      }
      if (!cancelled) await loadSensors('farm');
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadSensors(sourceScope, sourceNode);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [sourceScope, sourceNode]);

  const handleChange = (e) => {
    const name = e.target.name;
    setFormData({ ...formData, [name]: parseFloat(e.target.value) });
    setPresetApplied('');
    if (name === 'rainfall') setRainfallExplicit(true);
  };

  const handleReset = () => {
    setFormData({ ...defaults });
    setSelectedCrop('');
    setSelectedRegion('');
    setPresetApplied('');
    setRainfallExplicit(false);
    loadSensors(sourceScope, sourceNode);
  };

  const handleRegionPreset = (regionKey) => {
    setSelectedRegion(regionKey);
    setSelectedCrop('');
    if (!regionKey) return;
    const preset = regionPresets[regionKey];
    setFormData((prev) => (usingSensors
      ? { ...prev, ph: preset.ph, rainfall: preset.rainfall }
      : {
        n: preset.n, p: preset.p, k: preset.k, ph: preset.ph,
        moisture: preset.moisture, temperature: preset.temperature,
        humidity: preset.humidity, rainfall: preset.rainfall,
      }));
    setRainfallExplicit(Boolean(regionKey));
    setPresetApplied(preset.label);
    setTimeout(() => setPresetApplied(''), 4000);
  };

  const handleCropPreset = (cropKey) => {
    setSelectedCrop(cropKey);
    if (!cropKey) return;
    const preset = cropPresets[cropKey];
    setFormData((prev) => (usingSensors
      ? { ...prev, ph: preset.ph, rainfall: preset.rainfall }
      : {
        n: preset.n, p: preset.p, k: preset.k, ph: preset.ph,
        moisture: preset.moisture, temperature: preset.temperature,
        humidity: preset.humidity, rainfall: preset.rainfall,
      }));
    setRainfallExplicit(Boolean(cropKey));
    setPresetApplied(preset.label);
    setTimeout(() => setPresetApplied(''), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await runAnalysis();
  };

  const runAnalysis = async (override = {}) => {
    const scope = override.scope || sourceScope;
    const nodeId = override.nodeId !== undefined ? override.nodeId : sourceNode;
    const sensed = override.formData || formData;
    const sensorsOn = override.usingSensors !== undefined ? override.usingSensors : usingSensors;
    const rainSet = override.rainfallExplicit !== undefined ? override.rainfallExplicit : rainfallExplicit;
    setLoading(true);
    setSubmitError('');
    try {
      const coords = resolveCoords(farmer, nodes, scope, nodeId);
      const payload = {
        ...sensed,
        state: farmer?.profile?.state || undefined,
        device_id: scope === 'node' ? nodeId : undefined,
        ...coords,
      };
      if (sensorsOn && !rainSet) {
        delete payload.rainfall;
      }
      const result = await requestCropDecision(payload);
      saveLatestAnalysis({
        at: new Date().toISOString(),
        crop_prediction: result.crop_prediction || null,
        rainfall_intelligence: result.rainfall_intelligence || null,
        rainfall_feature: result.rainfall_feature || null,
        rainfall_unavailable_reason: result.rainfall_unavailable_reason || null,
        decision: result.decision || null,
        recommended_crops: result.recommended_crops || [],
        input: sensed,
        scope,
        nodeId: scope === 'node' ? nodeId : null,
        device_id: payload.device_id || null,
      });
      navigate('/app/results', {
        state: {
          result,
          input: sensed,
          sensorSource: sensorNote,
          scope,
          nodeId: nodeId || null,
          telemetrySnapshot: snapshot,
          rainfallExplicit: rainSet,
        },
      });
      return result;
    } catch (error) {
      console.error(error);
      setSubmitError(mlErrorMessage(error, t));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const analyzeApi = useRef({});
  analyzeApi.current = { nodes, formData, usingSensors, rainfallExplicit, runAnalysis, loadSensors, setSourceScope, setSourceNode };

  useEffect(() => {
    emitPageReady('analyze');
    const handle = async (action) => {
      const api = analyzeApi.current;
      const started = Date.now();
      while (!api.nodes?.length && Date.now() - started < 8000) {
        await sleep(120);
      }
      const node = api.nodes.find((n) => Number(n.nodeNumber) === Number(action.nodeNumber));
      if (action.type === 'selectAnalysisNode') {
        if (!node) {
          completeAction(action.id, { ok: false, type: action.type, error: 'missing_node' });
          return;
        }
        api.setSourceScope('node');
        api.setSourceNode(node.nodeId);
        await api.loadSensors('node', node.nodeId);
        completeAction(action.id, { ok: true, type: action.type, nodeId: node.nodeId, nodeNumber: node.nodeNumber });
        return;
      }
      if (action.type === 'runAnalysis') {
        if (action.nodeNumber && !node) {
          completeAction(action.id, { ok: false, type: action.type, error: 'missing_node' });
          return;
        }
        try {
          if (node) {
            api.setSourceScope('node');
            api.setSourceNode(node.nodeId);
            const data = await api.loadSensors('node', node.nodeId);
            const sensed = data?.sensed;
            const form = sensed ? {
              ...api.formData,
              n: sensed.n ?? api.formData.n,
              p: sensed.p ?? api.formData.p,
              k: sensed.k ?? api.formData.k,
              moisture: sensed.moisture ?? api.formData.moisture,
              temperature: sensed.temperature ?? api.formData.temperature,
              humidity: sensed.humidity ?? api.formData.humidity,
            } : api.formData;
            const result = await api.runAnalysis({
              scope: 'node',
              nodeId: node.nodeId,
              formData: form,
              usingSensors: Boolean(sensed),
              rainfallExplicit: false,
            });
            completeAction(action.id, {
              ok: true,
              type: action.type,
              crop: result?.crop_prediction?.recommended_crop,
              recommended: result?.recommended_crops?.[0],
            });
            return;
          }
          const result = await api.runAnalysis({});
          completeAction(action.id, {
            ok: true,
            type: action.type,
            crop: result?.crop_prediction?.recommended_crop,
            recommended: result?.recommended_crops?.[0],
          });
        } catch (err) {
          completeAction(action.id, { ok: false, type: action.type, error: err.message || 'analysis_failed' });
        }
      }
    };
    const unsub = subscribeSaathi(['selectAnalysisNode', 'runAnalysis'], handle);
    return () => {
      unsub();
      emitPageGone('analyze');
    };
  }, []);

  const parameters = [
    { name: 'n', label: t.analyze_nitrogen, min: 0, max: 150, unit: 'mg/kg', hint: t.pg_hint_n },
    { name: 'p', label: t.analyze_phosphorus, min: 0, max: 150, unit: 'mg/kg', hint: t.pg_hint_p },
    { name: 'k', label: t.analyze_potassium, min: 0, max: 250, unit: 'mg/kg', hint: t.pg_hint_k },
    { name: 'ph', label: t.analyze_ph, min: 0, max: 14, step: 0.1, unit: '', hint: t.pg_hint_ph },
    { name: 'moisture', label: t.analyze_moisture, min: 0, max: 100, unit: '%', hint: t.pg_hint_moist },
    { name: 'temperature', label: t.analyze_temperature, min: -10, max: 50, unit: '°C', hint: t.pg_hint_temp },
    { name: 'humidity', label: t.analyze_humidity, min: 0, max: 100, unit: '%', hint: t.pg_hint_humid },
    { name: 'rainfall', label: t.analyze_rainfall, min: 0, max: 300, unit: 'mm', hint: t.pg_hint_rain },
  ];

  const plainLabel = (value) => String(value || '').replace(/^[^A-Za-z]+/, '').trim();

  return (
    <div className="farm-page">
      <PageHeader
        kicker={t.nav_analyze}
        title={t.pg_analyze_h}
        lede={t.pg_analyze_p}
        tools={<DataBadge kind={usingSensors ? 'demo' : 'analysis'} />}
      />
      <ol className="pg-flow">
        <li><strong>{t.pg_step_field}</strong></li>
        <li><strong>{t.pg_step_soil}</strong></li>
        <li><strong>{t.pg_step_climate}</strong></li>
        <li><strong>{t.pg_step_analyze}</strong></li>
      </ol>
      <p className="farm-note" style={{ marginBottom: '1.2rem' }}>{t.pg_analyze_note}</p>

      <form onSubmit={handleSubmit}>
        <div className="farm-panel az-group">
          <h2>{t.pg_az_source}</h2>
          <p className="az-meta">{t.pg_az_from_sensors}</p>
          <div className="az-field" style={{ marginTop: '0.85rem' }}>
            <select
              className="az-select"
              value={sourceScope === 'node' ? sourceNode : 'farm'}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'farm') {
                  setSourceScope('farm');
                  setSourceNode('');
                  loadSensors('farm');
                } else {
                  setSourceScope('node');
                  setSourceNode(value);
                  loadSensors('node', value);
                }
              }}
            >
              <option value="farm">{t.pg_az_farm}</option>
              {nodes.map((node) => (
                <option key={node.nodeId} value={node.nodeId}>
                  {t.pg_map_node} {node.nodeNumber} · {node.zone}
                </option>
              ))}
            </select>
            <ChevronDown size={18} className="az-chevron" />
          </div>
          {sensorNote && <p className="farm-note">{sensorNote}</p>}
          {usingSensors && rainRecent != null && (
            <p className="farm-note">{t.pg_az_rain_note}: {rainRecent} mm</p>
          )}
          {usingSensors && (
            <p className="farm-note">{t.pg_az_ph_note}</p>
          )}
          {usingSensors && !rainfallExplicit && (
            <p className="farm-note">{t.pg_az_rain_model}</p>
          )}
          {snapshot?.sensors && Object.keys(snapshot.sensors).length > 0 && (
            <>
              <h3 style={{ margin: '1rem 0 0.5rem', fontSize: '0.95rem' }}>{t.pg_az_snapshot}</h3>
              <ul className="map-sensors">
                {Object.values(snapshot.sensors).map((item) => (
                  <li key={item.key} className={item.status === 'CRITICAL' ? 'is-critical' : ''}>
                    <span>{item.label}</span>
                    <strong className="tabular">
                      {item.value}{item.unit ? ` ${item.unit}` : ''}
                    </strong>
                    <em>{qualityLabel(item.status, t)}</em>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* ━━━ Region Preset Picker ━━━ */}
        <div className="farm-panel az-group">
          <h2>{t.pg_region}</h2>
          <p className="az-meta">{t.pg_region_p}</p>
          <div className="az-field" style={{ marginTop: '0.85rem' }}>
            <select
              id="region-preset-select"
              className="az-select"
              value={selectedRegion}
              onChange={(e) => handleRegionPreset(e.target.value)}
            >
              {Object.keys(regionPresets).map((key) => (
                <option key={key} value={key}>
                  {key ? plainLabel(regionPresets[key].label) : t.analyze_choose_region}
                </option>
              ))}
            </select>
            <ChevronDown size={18} className="az-chevron" />
          </div>

          {/* Region Detail Card */}
          <AnimatePresence>
            {selectedRegion && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ marginTop: '1rem' }}
              >
                {/* Description & Soil Type */}
                <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)', borderRadius: '0.55rem', padding: '0.95rem', marginBottom: '0.75rem' }}>
                  <p className="az-meta" style={{ margin: 0 }}>{regionPresets[selectedRegion].desc}</p>
                  <p className="az-meta">{regionPresets[selectedRegion].soil}</p>
                </div>
                <div className="az-chips">
                  <span>N {regionPresets[selectedRegion].n}</span>
                  <span>P {regionPresets[selectedRegion].p}</span>
                  <span>K {regionPresets[selectedRegion].k}</span>
                  <span>pH {regionPresets[selectedRegion].ph}</span>
                  <span>{regionPresets[selectedRegion].temperature}°C</span>
                  <span>{regionPresets[selectedRegion].moisture}%</span>
                </div>
                <div className="az-chips" style={{ marginTop: '0.55rem' }}>
                  <span>{t.pg_best_crops}:</span>
                  {regionPresets[selectedRegion].crops.map((crop) => (
                    <span key={crop}>{crop}</span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ━━━ Crop Preset Picker ━━━ */}
        <div className="farm-panel az-group">
          <h2>{t.pg_crop_fill}</h2>
          <p className="az-meta">{t.pg_crop_p}</p>
          <div className="az-field" style={{ marginTop: '0.85rem' }}>
            <select
              className="az-select"
              value={selectedCrop}
              onChange={(e) => handleCropPreset(e.target.value)}
            >
              {Object.keys(cropPresets).map((key) => (
                <option key={key} value={key}>
                  {key ? cropLabel(plainLabel(cropPresets[key].label), t) : t.analyze_choose_crop}
                </option>
              ))}
            </select>
            <ChevronDown size={18} className="az-chevron" />
          </div>

          {/* Show NPK preview when a crop is selected */}
          <AnimatePresence>
            {selectedCrop && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ marginTop: '1rem' }}
              >
                <div className="az-chips">
                  <span>N {cropPresets[selectedCrop].n}</span>
                  <span>P {cropPresets[selectedCrop].p}</span>
                  <span>K {cropPresets[selectedCrop].k}</span>
                  <span>pH {cropPresets[selectedCrop].ph}</span>
                  <span>{cropPresets[selectedCrop].temperature}°</span>
                  <span>{cropPresets[selectedCrop].rainfall}mm</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Applied toast */}
          <AnimatePresence>
            {presetApplied && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                style={{ marginTop: '0.75rem' }}
                className="az-meta"
              >
                {t.pg_loaded} {plainLabel(presetApplied)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ━━━ Parameter groups ━━━ */}
        {[
          { title: t.pg_nutrients, keys: ['n', 'p', 'k'] },
          { title: t.pg_chemistry, keys: ['ph', 'moisture'] },
          { title: t.pg_climate, keys: ['temperature', 'humidity', 'rainfall'] },
        ].map((group) => (
        <div key={group.title} className="az-group">
          <h2>{group.title}</h2>
        <div className="az-grid">
          {parameters.filter((p) => group.keys.includes(p.name)).map((param) => {
            const isActive = activeParam === param.name;
            return (
              <div
                key={param.name}
                className="az-param"
                onMouseEnter={() => setActiveParam(param.name)}
                onMouseLeave={() => setActiveParam(null)}
              >
                <div className="az-param-top">
                  <label htmlFor={`az-${param.name}`}>{param.label}</label>
                  <output className="tabular" htmlFor={`az-${param.name}`}>
                    {formData[param.name]}{param.unit ? ` ${param.unit}` : ''}
                  </output>
                </div>
                <input
                  id={`az-${param.name}`}
                  type="range"
                  name={param.name}
                  min={param.min}
                  max={param.max}
                  step={param.step || 1}
                  value={formData[param.name]}
                  onChange={handleChange}
                />
                {isActive && <p className="az-hint">{param.hint}</p>}
              </div>
            );
          })}
        </div>
        </div>
        ))}

        {submitError && (
          <p className="az-error" role="alert">
            <AlertTriangle size={16} /> {submitError}
          </p>
        )}

        <div className="az-actions">
          <button type="button" className="btn-secondary" onClick={handleReset}>
            <RotateCcw size={16} /> {t.analyze_reset}
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (
              <><Loader2 className="animate-spin" size={18} /> {t.analyze_analyzing}</>
            ) : (
              <><Cpu size={16} /> {t.analyze_submit}</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Analyze;
