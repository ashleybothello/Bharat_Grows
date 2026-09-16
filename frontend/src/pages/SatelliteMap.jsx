import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Layers, Satellite, X } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { GIS_SOURCES, agriForIso } from '../data/indiaAgriculture.js';
import './gis.css';

const INDIA_VIEW = [22.8, 79.0];
const INDIA_ZOOM = 5;
const INDIA_BOUNDS = L.latLngBounds([6.4, 67.0], [37.6, 98.0]);
const SAT_TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attr: GIS_SOURCES.satellite,
  maxZoom: 18,
};

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function focusBounds(map, bounds, maxZoom = 8) {
  if (!map || !bounds || !bounds.isValid()) return;
  if (typeof map.flyToBounds === 'function') {
    map.flyToBounds(bounds, { padding: [48, 48], maxZoom, duration: 0.55 });
    return;
  }
  map.fitBounds(bounds, { padding: [48, 48], maxZoom });
}

export default function SatelliteMap() {
  const { t } = useLang();
  const [searchParams] = useSearchParams();
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const outlineRef = useRef(null);
  const [statesData, setStatesData] = useState(null);
  const [districtsData, setDistrictsData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [leftOpen, setLeftOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 860);

  const iso = searchParams.get('iso') || '';
  const kind = searchParams.get('kind') || (iso ? 'state' : '');
  const name = searchParams.get('name') || '';
  const parent = searchParams.get('parent') || '';
  const agri = iso ? agriForIso(iso) : null;
  const gisHref = iso ? `/app/gis?iso=${encodeURIComponent(iso)}` : '/app/gis';

  const title = useMemo(() => {
    if (kind === 'district' && name) return name;
    if (name) return name;
    if (iso && agri) return iso;
    return t.pg_gis_crumb_india;
  }, [kind, name, iso, agri, t.pg_gis_crumb_india]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/gis/india-adm1.geojson');
        if (!res.ok) throw new Error('states');
        const json = await res.json();
        if (!cancelled) setStatesData(json);
      } catch {
        if (!cancelled) setLoadError(t.pg_gis_bound_fail);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    if (kind !== 'district' || districtsData) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/gis/india-adm2.geojson');
        if (!res.ok) throw new Error('districts');
        const json = await res.json();
        if (!cancelled) setDistrictsData(json);
      } catch {
        if (!cancelled) setLoadError(t.pg_gis_dist_fail);
      }
    })();
    return () => { cancelled = true; };
  }, [kind, districtsData, t]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return undefined;
    const map = L.map(hostRef.current, {
      zoomControl: false,
      minZoom: 4,
      maxZoom: 18,
      maxBounds: INDIA_BOUNDS.pad(0.15),
      maxBoundsViscosity: 0.8,
      attributionControl: true,
    }).setView(INDIA_VIEW, INDIA_ZOOM);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix('');
    L.tileLayer(SAT_TILES.url, {
      attribution: SAT_TILES.attr,
      maxZoom: SAT_TILES.maxZoom,
    }).addTo(map);
    mapRef.current = map;
    const syncSize = () => map.invalidateSize();
    const raf = window.requestAnimationFrame(syncSize);
    const later = window.setTimeout(syncSize, 320);
    window.addEventListener('resize', syncSize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(later);
      window.removeEventListener('resize', syncSize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !statesData) return undefined;
    if (outlineRef.current) {
      map.removeLayer(outlineRef.current);
      outlineRef.current = null;
    }

    let feature = null;
    let maxZoom = 8;
    if (kind === 'district' && name && districtsData) {
      feature = districtsData.features.find((row) => fold(row.properties.shapeName) === fold(name))
        || districtsData.features.find((row) => fold(row.properties.shapeName).includes(fold(name)));
      maxZoom = 11;
    }
    if (!feature && iso) {
      feature = statesData.features.find((row) => row.properties.shapeISO === iso);
      maxZoom = 8;
    }

    if (!feature) {
      map.setView(INDIA_VIEW, INDIA_ZOOM);
      return undefined;
    }

    const layer = L.geoJSON(feature, {
      style: {
        color: '#f4e6c8',
        weight: 2.4,
        fillColor: '#c9b48a',
        fillOpacity: 0.08,
      },
    }).addTo(map);
    outlineRef.current = layer;
    focusBounds(map, layer.getBounds(), maxZoom);
    return () => {
      map.removeLayer(layer);
    };
  }, [statesData, districtsData, iso, kind, name]);

  return (
    <div className="gis-page sat-page">
      <div ref={hostRef} className="gis-canvas" role="application" aria-label={t.pg_sat_h} />

      <aside className={`gis-rail gis-rail-left${leftOpen ? ' is-open' : ''}`}>
        <header className="gis-rail-head">
          <div className="gis-rail-head-row">
            <p className="gis-kicker">{t.nav_satellite}</p>
            <button
              type="button"
              className="gis-close gis-close-mobile"
              onClick={() => setLeftOpen(false)}
              aria-label={t.pg_gis_clear}
            >
              <X size={16} />
            </button>
          </div>
          <h1>{t.pg_sat_h}</h1>
          <p>{t.pg_sat_connected}</p>
        </header>

        <Link to={gisHref} className="gis-analyze gis-sat-back">
          <ArrowLeft size={14} /> {t.pg_sat_open_gis}
        </Link>

        <article className="gis-place">
          <header>
            <p>{kind === 'district' ? t.pg_gis_district : (iso ? t.pg_gis_state : t.nav_gis)}</p>
            <h2>{title}</h2>
            {parent && <p>{parent}</p>}
          </header>
          {!iso && (
            <p className="gis-src">{t.pg_sat_pick}</p>
          )}
          {iso && agri && (
            <>
              <h3>{t.pg_gis_soil}</h3>
              <p className="gis-soil">
                <span style={{ background: agri.soil.color }} />
                {t[`soil_${agri.soil.id}`] || agri.soil.label}
              </p>
              <p className="gis-src">{GIS_SOURCES.soil}</p>
            </>
          )}
        </article>

            <p className="gis-src">{t.pg_sat_ndvi_note}</p>
            <p className="gis-src">{SAT_TILES.attr}</p>
      </aside>

      {loadError && <p className="gis-banner">{loadError}</p>}
      <div className="gis-chrome">
        <div className="gis-fabs">
          <button
            type="button"
            className={`gis-fab${leftOpen ? ' is-active' : ''}`}
            onClick={() => setLeftOpen((open) => !open)}
          >
            <Layers size={15} /> {t.nav_satellite}
          </button>
        </div>
        <p className="sat-live-flag">
          <Satellite size={14} /> {iso ? t.format('pg_sat_region', { name: title }) : t.pg_gis_india}
        </p>
      </div>
    </div>
  );
}
