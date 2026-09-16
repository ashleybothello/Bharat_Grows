import { useNavigate } from 'react-router-dom';
import {
  CloudSun, Calendar, Droplets, Globe, Landmark, FileText,
  Cpu, Satellite, CloudRain, Bug, FlaskConical, TrendingUp,
  ChevronDown, ChevronUp, ArrowRight, Grid, UserRound,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useLang } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';

export default function MoreFeatures() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [openSections, setOpenSections] = useState({ 0: true, 1: true, 2: true });

  const features = [
    {
      category: t.pg_more_account,
      icon: <UserRound size={18} />,
      items: [
        { path: '/app/profile', title: t.pg_more_profile, desc: t.pg_more_profile_d, icon: <UserRound size={20} /> },
      ],
    },
    {
      category: t.pg_more_adv,
      icon: <Grid size={18} />,
      items: [
        { path: '/app/iot', title: t.pg_more_iot, desc: t.pg_more_iot_d, icon: <Cpu size={20} /> },
        { path: '/app/satellite', title: t.pg_more_sat, desc: t.pg_more_sat_d, icon: <Satellite size={20} /> },
        { path: '/app/irrigation', title: t.pg_more_irr, desc: t.pg_more_irr_d, icon: <CloudRain size={20} /> },
        { path: '/app/pest-detection', title: t.pg_more_pest, desc: t.pg_more_pest_d, icon: <Bug size={20} /> },
        { path: '/app/fertilizer', title: t.pg_more_fert, desc: t.pg_more_fert_d, icon: <FlaskConical size={20} /> },
        { path: '/app/market', title: t.pg_more_mkt, desc: t.pg_more_mkt_d, icon: <TrendingUp size={20} /> },
      ],
    },
    {
      category: t.pg_more_intel,
      icon: <Globe size={18} />,
      items: [
        { path: '/app/weather', title: t.pg_more_wx, desc: t.pg_more_wx_d, icon: <CloudSun size={20} /> },
        { path: '/app/gis', title: t.nav_gis, desc: t.pg_gis_p, icon: <Globe size={20} /> },
        { path: '/app/crop-calendar', title: t.pg_more_cal, desc: t.pg_more_cal_d, icon: <Calendar size={20} /> },
        { path: '/app/water-footprint', title: t.pg_more_water, desc: t.pg_more_water_d, icon: <Droplets size={20} /> },
        { path: '/app/sustainability', title: t.pg_more_esg, desc: t.pg_more_esg_d, icon: <Globe size={20} /> },
        { path: '/app/gov-schemes', title: t.pg_more_gov, desc: t.pg_more_gov_d, icon: <Landmark size={20} /> },
        { path: '/app/export-reports', title: t.pg_more_export, desc: t.pg_more_export_d, icon: <FileText size={20} /> },
      ],
    },
  ];

  return (
    <div className="farm-page">
      <PageHeader kicker={t.nav_more} title={t.pg_more_h} lede={t.pg_more_p} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
        {features.map((section, idx) => (
          <section key={section.category} className="az-group">
            <button
              type="button"
              className="more-toggle"
              onClick={() => setOpenSections((prev) => ({ ...prev, [idx]: !prev[idx] }))}
            >
              <span>
                {section.icon}
                <h2>{section.category}</h2>
              </span>
              <span className="az-meta" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                {section.items.length} {t.pg_more_tools}
                {openSections[idx] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {openSections[idx] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="more-grid">
                    {section.items.map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        className="feature-tile"
                        onClick={() => navigate(item.path)}
                      >
                        <h3>{item.title}</h3>
                        <p className="az-meta">{item.desc}</p>
                        <span className="go">
                          {t.pg_open} <ArrowRight size={16} />
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        ))}
      </div>
    </div>
  );
}
