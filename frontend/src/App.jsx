import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import HardwareBeta from './pages/HardwareBeta';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Analyze from './pages/Analyze';
import IoTTelemetry from './pages/IoTTelemetry';
import SatelliteMap from './pages/SatelliteMap';
import IrrigationScheduler from './pages/IrrigationScheduler';
import PestDetection from './pages/PestDetection';
import FertilizerOptimizer from './pages/FertilizerOptimizer';
import MarketForecasting from './pages/MarketForecasting';
import CropMarketDetail from './pages/CropMarketDetail';
import Results from './pages/Results';
import Insights from './pages/Insights';
import History from './pages/History';
import Communication from './pages/Communication';
import MoreFeatures from './pages/MoreFeatures';
import Profile from './pages/Profile';
import WeatherIntelligence from './pages/WeatherIntelligence';
import CropCalendar from './pages/CropCalendar';
import WaterFootprint from './pages/WaterFootprint';
import SustainabilityScore from './pages/SustainabilityScore';
import GovSchemes from './pages/GovSchemes';
import ExportReports from './pages/ExportReports';
import GIS from './pages/GIS';
import AIChatbot from './components/AIChatbot';

const ProtectedRoute = ({ children }) => {
  const { isAuthed } = useAuth();
  if (!isAuthed) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <HashRouter>
          <AIChatbot />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/beta" element={<HardwareBeta />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route path="/app" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="analyze" element={<Analyze />} />
              <Route path="map" element={<Navigate to="/app/iot" replace />} />
              <Route path="iot" element={<IoTTelemetry />} />
              <Route path="gis" element={<GIS />} />
              <Route path="satellite" element={<SatelliteMap />} />
              <Route path="irrigation" element={<IrrigationScheduler />} />
              <Route path="pest-detection" element={<PestDetection />} />
              <Route path="fertilizer" element={<FertilizerOptimizer />} />
              <Route path="market" element={<MarketForecasting />} />
              <Route path="market/crop/:commodity" element={<CropMarketDetail />} />
              <Route path="more" element={<MoreFeatures />} />
              <Route path="profile" element={<Profile />} />
              <Route path="weather" element={<WeatherIntelligence />} />
              <Route path="crop-calendar" element={<CropCalendar />} />
              <Route path="water-footprint" element={<WaterFootprint />} />
              <Route path="sustainability" element={<SustainabilityScore />} />
              <Route path="gov-schemes" element={<GovSchemes />} />
              <Route path="export-reports" element={<ExportReports />} />
              <Route path="results" element={<Results />} />
              <Route path="insights" element={<Insights />} />
              <Route path="history" element={<History />} />
              <Route path="communication" element={<Communication />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
