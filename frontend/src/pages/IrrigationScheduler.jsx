import React, { useEffect, useState } from 'react';
import { CloudSun, Droplets, Thermometer, Calendar, ShieldAlert, CheckCircle, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005';

const MOCK_WEATHER_DATA = {
  success: true,
  location: 'Indore District, MP',
  smart_irrigation_recommendation: {
    action: 'Run Drip Irrigation Today (5:30 AM)',
    optimal_time: '05:30 AM – 07:30 AM',
    liters_per_acre: 4200,
    efficiency_rating: 'Saved 1,800L vs flood irrigation. 32% water cost reduction.'
  },
  forecast: [
    { day: 'Mon', condition: 'Sunny ☀️', temp_high: 34, temp_low: 22, rain_chance: 5, water_needed_liters_acre: 4200 },
    { day: 'Tue', condition: 'Partly Cloudy', temp_high: 33, temp_low: 21, rain_chance: 15, water_needed_liters_acre: 3800 },
    { day: 'Wed', condition: 'Windy 💨', temp_high: 32, temp_low: 20, rain_chance: 20, water_needed_liters_acre: 3600 },
    { day: 'Thu', condition: 'Thunderstorm ⛈️', temp_high: 28, temp_low: 18, rain_chance: 85, water_needed_liters_acre: 0 },
    { day: 'Fri', condition: 'Rain 🌧️', temp_high: 27, temp_low: 19, rain_chance: 70, water_needed_liters_acre: 0 },
    { day: 'Sat', condition: 'Cloudy ☁️', temp_high: 30, temp_low: 20, rain_chance: 30, water_needed_liters_acre: 2800 },
    { day: 'Sun', condition: 'Sunny ☀️', temp_high: 35, temp_low: 22, rain_chance: 5, water_needed_liters_acre: 4400 },
  ]
};

export default function IrrigationScheduler() {
  const { t } = useLang();
  const [weatherData, setWeatherData] = useState(null);
  const [acres, setAcres] = useState(2);
  const [cropType, setCropType] = useState('Wheat');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/weather/forecast`);
        if (res.data?.success) {
          setWeatherData(res.data);
        } else {
          setWeatherData(MOCK_WEATHER_DATA);
        }
      } catch (err) {
        console.warn('Backend unavailable — using demo weather data.');
        setWeatherData(MOCK_WEATHER_DATA);
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();
  }, []);

  const totalWaterToday = (weatherData?.smart_irrigation_recommendation?.liters_per_acre || 4200) * acres;

  return (
    <div className="farm-page">

      <PageHeader
        kicker={t.pg_more_irr}
        title={t.pg_more_irr}
        lede={t.pg_more_irr_d}
        tools={weatherData?.location ? <span className="az-meta">{weatherData.location}</span> : null}
      />

      {/* Main Grid: AI Recommendation Banner + Interactive Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>

        {/* Recommendation Engine Box */}
        <div style={{
          background: 'linear-gradient(135deg, #0277BD 0%, #00838F 100%)',
          borderRadius: '1rem',
          padding: '1.75rem',
          color: '#FFF',
          boxShadow: '0 8px 25px rgba(2, 119, 189, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.6rem', borderRadius: '1rem', width: 'fit-content', marginBottom: '0.75rem' }}>
            <Zap size={14} /> AI Recommendation Engine
          </div>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>
            {weatherData?.smart_irrigation_recommendation?.action || 'Run Drip Irrigation Today'}
          </h2>

          <p style={{ opacity: 0.9, fontSize: '0.92rem', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
            Optimal watering window: <strong>{weatherData?.smart_irrigation_recommendation?.optimal_time || '05:30 AM - 07:30 AM'}</strong>. Avoid afternoon evaporation losses.
          </p>

          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: '0.75rem', padding: '1rem', backdropFilter: 'blur(5px)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Water Volume ({acres} Acres)</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{totalWaterToday.toLocaleString()} Liters</div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Rain Skip Days</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>Thu, Fri ⛈️</div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', fontSize: '0.82rem', opacity: 0.95, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <CheckCircle size={16} color="#4ADE80" /> {weatherData?.smart_irrigation_recommendation?.efficiency_rating || 'Saved 1,800L with weather-based adjustment'}
          </div>
        </div>

        {/* Dynamic Calculator Controls */}
        <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1rem 0' }}>
            Field & Crop Settings
          </h3>

          <div style={{ marginBottom: '1.2rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#444', marginBottom: '0.4rem' }}>
              Select Crop Type:
            </label>
            <select
              value={cropType}
              onChange={(e) => setCropType(e.target.value)}
              style={{ width: '100%', padding: '0.65rem', borderRadius: '0.6rem', border: '1px solid #CCC', fontWeight: 600, fontSize: '0.9rem', outline: 'none' }}
            >
              <option value="Wheat">🌾 Wheat (Sharbati)</option>
              <option value="Paddy">🌱 Rice / Paddy</option>
              <option value="Cotton">☁️ Cotton</option>
              <option value="Tomato">🍅 Tomato</option>
              <option value="Sugarcane">🎋 Sugarcane</option>
            </select>
          </div>

          <div style={{ marginBottom: '1.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#444', marginBottom: '0.4rem' }}>
              <span>Land Parcel Size:</span>
              <span style={{ color: 'var(--primary)' }}>{acres} Acres</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="20"
              step="0.5"
              value={acres}
              onChange={(e) => setAcres(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
          </div>

          <div style={{ background: '#F9FAFB', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #E5E7EB', fontSize: '0.85rem', color: '#555' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span>Evapotranspiration (ET0):</span>
              <strong>5.2 mm/day</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span>Recommended Method:</span>
              <strong style={{ color: '#0277BD' }}>Drip Irrigation (90% Eff)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Soil Moisture Deficit:</span>
              <strong style={{ color: '#2E7D32' }}>-12 mm</strong>
            </div>
          </div>
        </div>

      </div>

      {/* 7-Day Weather & Water Forecast */}
      <div style={{ background: '#FFFFFF', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 1.2rem 0' }}>
          7-Day Microclimate & Water Demand Schedule
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.8rem' }}>
          {weatherData?.forecast.map((f, idx) => (
            <div
              key={idx}
              style={{
                background: f.rain_chance > 50 ? '#E0F7FA' : '#F9FAFB',
                border: `1px solid ${f.rain_chance > 50 ? '#B2EBF2' : '#E5E7EB'}`,
                borderRadius: '0.75rem',
                padding: '0.9rem 0.6rem',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-heading)' }}>{f.day}</div>
              <div style={{ fontSize: '0.78rem', color: '#666', margin: '0.2rem 0 0.5rem 0' }}>{f.condition}</div>

              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#333' }}>
                {f.temp_high}° <span style={{ fontSize: '0.8rem', color: '#777', fontWeight: 600 }}>/ {f.temp_low}°</span>
              </div>

              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: f.rain_chance > 50 ? '#0277BD' : '#666', marginTop: '0.4rem' }}>
                🌧️ {f.rain_chance}% Rain
              </div>

              <div style={{
                marginTop: '0.6rem',
                paddingTop: '0.4rem',
                borderTop: '1px solid rgba(0,0,0,0.06)',
                fontSize: '0.75rem',
                fontWeight: 800,
                color: f.water_needed_liters_acre > 0 ? '#1565C0' : '#2E7D32'
              }}>
                {f.water_needed_liters_acre > 0 ? `${(f.water_needed_liters_acre * acres / 1000).toFixed(1)}k L` : 'OFF 🌧️'}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
