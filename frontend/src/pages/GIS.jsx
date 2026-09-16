import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, MapPin, Search, X, LocateFixed, Satellite } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { SOIL_GROUPS, GIS_SOURCES, STATE_AGRI, agriForIso, soilFill } from '../data/indiaAgriculture.js';
import { completeAction, emitPageGone, emitPageReady, setUiContext, subscribeSaathi } from '../utils/saathi/bus';
import { serializeAgri } from '../utils/saathi/reply';
import './gis.css';

const INDIA_VIEW = [22.8, 79.0];
const INDIA_ZOOM = 5;
const INDIA_BOUNDS = L.latLngBounds([6.4, 67.0], [37.6, 98.0]);

const BASEMAPS = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: GIS_SOURCES.satellite,
    maxZoom: 18,
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attr: GIS_SOURCES.terrain,
    maxZoom: 17,
    subdomains: 'abc',
  },
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: GIS_SOURCES.streets,
    maxZoom: 19,
    subdomains: 'abc',
  },
};

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function styleState(feature, { soilOn, cropOn, selectedIso, cropFocus }) {
  const iso = feature.properties.shapeISO;
  const paint = soilFill(iso, soilOn, cropOn);
  const selected = iso === selectedIso;
  const agri = agriForIso(iso);
  const cropHit = !cropFocus || agri?.crops.some((crop) => fold(crop) === fold(cropFocus));
  let fillOpacity = paint.opacity;
  if (cropFocus && cropOn) {
    fillOpacity = cropHit ? Math.min(Math.max(paint.opacity, 0.52), 0.78) : 0.05;
  } else if (selected) {
    fillOpacity = Math.min(paint.opacity + 0.18, 0.8);
  }
  return {
    color: selected ? '#f4e6c8' : (soilOn || cropOn ? 'rgba(14,26,18,0.45)' : paint.color),
    weight: selected ? 2.6 : cropFocus && cropOn && cropHit ? 1.6 : 1,
    fillColor: paint.fill,
    fillOpacity,
  };
}

function focusBounds(map, bounds, maxZoom = 7) {
  if (!map || !bounds || !bounds.isValid()) return;
  if (typeof map.flyToBounds === 'function') {
    map.flyToBounds(bounds, { padding: [48, 48], maxZoom, duration: 0.55 });
    return;
  }
  map.fitBounds(bounds, { padding: [48, 48], maxZoom });
}

export default function GIS() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hostRef = useRef(null);
  const focusFromUrlRef = useRef(false);
  const mapRef = useRef(null);
  const tilesRef = useRef(null);
  const statesRef = useRef(null);
  const districtsRef = useRef(null);
  const leftRailRef = useRef(null);
  const rightRailRef = useRef(null);
  const chromeRef = useRef(null);
  const [basemap, setBasemap] = useState('satellite');
  const [soilOn, setSoilOn] = useState(true);
  const [cropOn, setCropOn] = useState(false);
  const [statesOn, setStatesOn] = useState(true);
  const [districtsOn, setDistrictsOn] = useState(false);
  const [statesData, setStatesData] = useState(null);
  const [districtsData, setDistrictsData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [cropQuery, setCropQuery] = useState('');
  const [cropFocus, setCropFocus] = useState('');
  const [leftOpen, setLeftOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 860);
  const [rightOpen, setRightOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 860);

  useEffect(() => {
    let desktop = window.innerWidth > 860;
    const onResize = () => {
      const now = window.innerWidth > 860;
      if (now === desktop) return;
      desktop = now;
      setLeftOpen(now);
      setRightOpen(now);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const agri = selected?.iso ? agriForIso(selected.iso) : null;

  const cropCatalogue = useMemo(() => {
    const set = new Set();
    Object.values(STATE_AGRI).forEach((row) => {
      row.crops.forEach((crop) => set.add(crop));
    });
    return [...set].sort();
  }, []);

  const cropSuggestions = useMemo(() => {
    if (cropQuery.trim().length < 2) return [];
    const q = fold(cropQuery);
    return cropCatalogue.filter((crop) => fold(crop).includes(q)).slice(0, 8);
  }, [cropQuery, cropCatalogue]);

  const cropMatchStates = useMemo(() => {
    if (!cropFocus) return [];
    const needle = fold(cropFocus);
    return Object.entries(STATE_AGRI)
      .filter(([, row]) => row.crops.some((crop) => fold(crop) === needle))
      .map(([iso]) => {
        const feat = statesData?.features?.find((f) => f.properties.shapeISO === iso);
        return feat?.properties.shapeName || iso;
      });
  }, [cropFocus, statesData]);

  const suggestions = useMemo(() => {
    if (!statesData || query.trim().length < 2) return [];
    const q = fold(query);
    return statesData.features
      .filter((f) => fold(f.properties.shapeName).includes(q) || fold(f.properties.shapeISO).includes(q))
      .slice(0, 8)
      .map((f) => ({
        iso: f.properties.shapeISO,
        name: f.properties.shapeName,
        feature: f,
      }));
  }, [query, statesData]);

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
    if (!districtsOn || districtsData) return undefined;
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
  }, [districtsOn, districtsData, t]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return undefined;
    const map = L.map(hostRef.current, {
      zoomControl: false,
      minZoom: 4,
      maxZoom: 12,
      maxBounds: INDIA_BOUNDS.pad(0.15),
      maxBoundsViscosity: 0.8,
      attributionControl: true,
    }).setView(INDIA_VIEW, INDIA_ZOOM);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix('');
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
    if (!map) return;
    if (tilesRef.current) map.removeLayer(tilesRef.current);
    const spec = BASEMAPS[basemap];
    tilesRef.current = L.tileLayer(spec.url, {
      attribution: spec.attr,
      maxZoom: spec.maxZoom,
      ...(spec.subdomains ? { subdomains: spec.subdomains } : { subdomains: 'abc' }),
    }).addTo(map);
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !statesData) return undefined;

    if (statesRef.current) {
      map.removeLayer(statesRef.current);
      statesRef.current = null;
    }
    if (!statesOn && !soilOn && !cropOn) return undefined;

    const layer = L.geoJSON(statesData, {
      style: (feature) => styleState(feature, { soilOn, cropOn, selectedIso: selected?.iso, cropFocus }),
      onEachFeature: (feature, lyr) => {
        const name = feature.properties.shapeName;
        const iso = feature.properties.shapeISO;
        lyr.on('click', () => {
          setSelected({
            kind: 'state',
            name,
            iso,
            bounds: lyr.getBounds(),
          });
          setRightOpen(true);
          focusBounds(map, lyr.getBounds(), 7);
        });
        lyr.on('mouseover', () => {
          const base = styleState(feature, { soilOn, cropOn, selectedIso: selected?.iso, cropFocus });
          lyr.setStyle({ ...base, weight: 2.4, fillOpacity: Math.min((base.fillOpacity || 0.4) + 0.1, 0.86) });
        });
        lyr.on('mouseout', () => lyr.setStyle(styleState(feature, { soilOn, cropOn, selectedIso: selected?.iso, cropFocus })));
        lyr.bindTooltip(name, { sticky: true, className: 'gis-tip' });
      },
    }).addTo(map);
    statesRef.current = layer;
    if (focusFromUrlRef.current && selected?.iso) {
      layer.eachLayer((lyr) => {
        if (lyr.feature?.properties?.shapeISO === selected.iso) {
          focusBounds(map, lyr.getBounds(), 7);
          focusFromUrlRef.current = false;
        }
      });
    }
    return () => {
      map.removeLayer(layer);
    };
  }, [statesData, soilOn, cropOn, statesOn, selected?.iso, cropFocus]);

  useEffect(() => {
    const iso = searchParams.get('iso');
    if (!iso || !statesData) return;
    const feat = statesData.features.find((row) => row.properties.shapeISO === iso);
    if (!feat) return;
    setSelected((prev) => {
      if (prev?.iso === iso) return prev;
      focusFromUrlRef.current = true;
      return { kind: 'state', name: feat.properties.shapeName, iso };
    });
    setRightOpen(true);
  }, [statesData, searchParams]);

  const openSatellite = () => {
    const params = new URLSearchParams();
    if (selected?.iso) params.set('iso', selected.iso);
    if (selected?.name) params.set('name', selected.name);
    if (selected?.kind) params.set('kind', selected.kind);
    if (selected?.parentName) params.set('parent', selected.parentName);
    const query = params.toString();
    navigate(`/app/satellite${query ? `?${query}` : ''}`);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (districtsRef.current) {
      map.removeLayer(districtsRef.current);
      districtsRef.current = null;
    }
    if (!districtsOn || !districtsData) return undefined;

    const layer = L.geoJSON(districtsData, {
      style: {
        color: 'rgba(246,241,231,0.55)',
        weight: 0.6,
        fillColor: '#c9b48a',
        fillOpacity: 0.04,
      },
      onEachFeature: (feature, lyr) => {
        const name = feature.properties.shapeName;
        lyr.on('click', (event) => {
          L.DomEvent.stopPropagation(event);
          let parentIso = selected?.iso || null;
          let parentName = selected?.kind === 'state' ? selected.name : null;
          if (statesRef.current) {
            statesRef.current.eachLayer((stateLayer) => {
              if (stateLayer.getBounds().contains(event.latlng)) {
                parentIso = stateLayer.feature?.properties?.shapeISO || parentIso;
                parentName = stateLayer.feature?.properties?.shapeName || parentName;
              }
            });
          }
          setSelected({
            kind: 'district',
            name,
            iso: parentIso,
            parentName,
            bounds: lyr.getBounds(),
          });
          setRightOpen(true);
          focusBounds(map, lyr.getBounds(), 9);
        });
        lyr.bindTooltip(name, { sticky: true, className: 'gis-tip' });
      },
    }).addTo(map);
    districtsRef.current = layer;
    return () => {
      map.removeLayer(layer);
    };
  }, [districtsOn, districtsData]);

  const goIndia = () => {
    setSelected(null);
    const map = mapRef.current;
    if (map?.flyTo) map.flyTo(INDIA_VIEW, INDIA_ZOOM, { duration: 0.5 });
    else map?.setView(INDIA_VIEW, INDIA_ZOOM);
  };

  const pickSuggestion = (item) => {
    setQuery('');
    setSelected({ kind: 'state', name: item.name, iso: item.iso });
    setRightOpen(true);
    if (statesRef.current) {
      statesRef.current.eachLayer((layer) => {
        if (layer.feature?.properties?.shapeISO === item.iso) {
          focusBounds(mapRef.current, layer.getBounds(), 7);
        }
      });
    }
  };

  const applyCropFocus = (crop) => {
    setCropFocus(crop);
    setCropOn(true);
    setCropQuery('');
  };

  const zoomToSelectedState = () => {
    if (!selected?.iso) return;
    const name = selected.kind === 'district' ? (selected.parentName || selected.name) : selected.name;
    setSelected({ kind: 'state', name, iso: selected.iso });
    statesRef.current?.eachLayer((layer) => {
      if (layer.feature?.properties?.shapeISO === selected.iso) {
        focusBounds(mapRef.current, layer.getBounds(), 7);
      }
    });
  };

  const apiRef = useRef({});
  apiRef.current = {
    map: mapRef,
    statesLayer: statesRef,
    districtsLayer: districtsRef,
    statesData,
    districtsData,
    selected,
    setSelected,
    setQuery,
    setSoilOn,
    setCropOn,
    setStatesOn,
    setDistrictsOn,
    setBasemap,
    goIndia,
    setRightOpen,
  };

  useEffect(() => {
    if (!statesData) return undefined;
    emitPageReady('gis');
    const GIS_ACTIONS = [
      'searchGISLocation', 'selectGISState', 'selectGISDistrict',
      'activateGISLayer', 'deactivateGISLayer', 'zoomToGISRegion',
    ];

    const findState = (query, iso) => {
      const features = apiRef.current.statesData?.features || [];
      if (iso) {
        const hit = features.find((f) => f.properties.shapeISO === iso);
        if (hit) return { iso: hit.properties.shapeISO, name: hit.properties.shapeName, feature: hit };
      }
      const needle = fold(query);
      if (!needle) return null;
      return features
        .map((f) => ({ iso: f.properties.shapeISO, name: f.properties.shapeName, feature: f }))
        .find((row) => fold(row.name).includes(needle) || fold(row.iso).includes(needle)) || null;
    };

    const zoomIso = (iso, maxZoom = 7) => {
      const map = apiRef.current.map.current;
      const group = apiRef.current.statesLayer.current;
      if (!map || !group || !iso) return false;
      let done = false;
      group.eachLayer((layer) => {
        if (layer.feature?.properties?.shapeISO === iso) {
          focusBounds(map, layer.getBounds(), maxZoom);
          done = true;
        }
      });
      return done;
    };

    const applyLayer = (layer, on) => {
      if (layer === 'soil') apiRef.current.setSoilOn(on);
      else if (layer === 'crops' || layer === 'crop') apiRef.current.setCropOn(on);
      else if (layer === 'states') apiRef.current.setStatesOn(on);
      else if (layer === 'districts') apiRef.current.setDistrictsOn(on);
      else if (layer === 'satellite' || layer === 'terrain' || layer === 'streets') apiRef.current.setBasemap(layer);
      else return false;
      return true;
    };

    const handle = async (action) => {
      try {
        if (action.type === 'activateGISLayer' || action.type === 'deactivateGISLayer') {
          const on = action.type === 'activateGISLayer' && action.on !== false;
          const ok = applyLayer(action.layer, on);
          completeAction(action.id, ok
            ? { ok: true, type: action.type, layer: action.layer, on }
            : { ok: false, type: action.type, error: 'unknown_layer' });
          return;
        }

        if (action.type === 'selectGISDistrict') {
          apiRef.current.setDistrictsOn(true);
          const started = Date.now();
          while (!apiRef.current.districtsData && Date.now() - started < 8000) {
            await new Promise((r) => setTimeout(r, 120));
          }
          const features = apiRef.current.districtsData?.features || [];
          const hit = features.find((f) => fold(f.properties.shapeName).includes(fold(action.name || action.query)));
          if (!hit) {
            completeAction(action.id, { ok: false, type: action.type, error: 'not_found' });
            return;
          }
          const group = apiRef.current.districtsLayer.current;
          const map = apiRef.current.map.current;
          let parentIso = apiRef.current.selected?.iso || null;
          group?.eachLayer((layer) => {
            if (layer.feature === hit || layer.feature?.properties?.shapeName === hit.properties.shapeName) {
              focusBounds(map, layer.getBounds(), 9);
            }
          });
          apiRef.current.setSelected({
            kind: 'district',
            name: hit.properties.shapeName,
            iso: parentIso,
          });
          apiRef.current.setRightOpen?.(true);
          completeAction(action.id, {
            ok: true,
            type: action.type,
            name: hit.properties.shapeName,
            agri: serializeAgri(parentIso, agriForIso(parentIso)),
          });
          return;
        }

        const query = action.name || action.query || action.iso;
        const found = findState(query, action.iso);
        if (!found) {
          completeAction(action.id, { ok: false, type: action.type, error: 'not_found', query });
          return;
        }
        if (action.soil) apiRef.current.setSoilOn(true);
        if (action.crops) apiRef.current.setCropOn(true);
        apiRef.current.setQuery('');
        apiRef.current.setSelected({ kind: 'state', name: found.name, iso: found.iso });
        apiRef.current.setRightOpen?.(true);
        zoomIso(found.iso);
        completeAction(action.id, {
          ok: true,
          type: action.type,
          name: found.name,
          iso: found.iso,
          agri: serializeAgri(found.iso, agriForIso(found.iso)),
        });
      } catch (err) {
        completeAction(action.id, { ok: false, type: action.type, error: err.message || 'gis_failed' });
      }
    };

    return subscribeSaathi(GIS_ACTIONS, handle);
  }, [statesData]);

  useEffect(() => () => emitPageGone('gis'), []);

  useEffect(() => {
    setUiContext({
      selectedGISRegion: selected ? { kind: selected.kind, name: selected.name, iso: selected.iso } : null,
      selectedGISLayer: soilOn ? 'soil' : cropOn ? 'crops' : 'basemap',
    });
  }, [selected, soilOn, cropOn]);

  useEffect(() => {
    const nodes = [leftRailRef.current, rightRailRef.current, chromeRef.current];
    nodes.forEach((el) => {
      if (!el) return;
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    });
  }, [leftOpen, rightOpen]);

  const stateLabel = selected?.kind === 'district' ? selected.parentName : selected?.name;

  return (
    <div className="gis-page">
      <div ref={hostRef} className="gis-canvas" role="application" aria-label={t.pg_gis_h} />

      <aside
        ref={leftRailRef}
        className={`gis-rail gis-rail-left${leftOpen ? ' is-open' : ''}`}
      >
        <header className="gis-rail-head">
          <div className="gis-rail-head-row">
            <p className="gis-kicker">{t.nav_gis}</p>
            <button
              type="button"
              className="gis-close gis-close-mobile"
              onClick={() => setLeftOpen(false)}
              aria-label={t.pg_gis_clear}
            >
              <X size={16} />
            </button>
          </div>
          <h1>{t.pg_gis_h}</h1>
          <p>{t.pg_gis_p}</p>
        </header>

        <label className="gis-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && suggestions[0]) pickSuggestion(suggestions[0]);
            }}
            placeholder={t.pg_gis_search}
          />
        </label>
        {suggestions.length > 0 && (
          <ul className="gis-suggest">
            {suggestions.map((item) => (
              <li key={item.iso}>
                <button type="button" onClick={() => pickSuggestion(item)}>
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <section>
          <h2><Layers size={14} /> {t.pg_gis_basemap}</h2>
          {['satellite', 'terrain', 'streets'].map((key) => (
            <label key={key} className="gis-opt">
              <input
                type="radio"
                name="basemap"
                checked={basemap === key}
                onChange={() => setBasemap(key)}
              />
              {t[`pg_gis_${key}`]}
            </label>
          ))}
        </section>

        <section>
          <h2>{t.pg_gis_layers}</h2>
          <label className="gis-opt">
            <input type="checkbox" checked={soilOn} onChange={(e) => setSoilOn(e.target.checked)} />
            {t.pg_gis_soil}
          </label>
          <label className="gis-opt">
            <input
              type="checkbox"
              checked={cropOn}
              onChange={(e) => {
                setCropOn(e.target.checked);
                if (!e.target.checked) setCropFocus('');
              }}
            />
            {t.pg_gis_crops}
          </label>
          <label className="gis-opt">
            <input type="checkbox" checked={statesOn} onChange={(e) => setStatesOn(e.target.checked)} />
            {t.pg_gis_states}
          </label>
          <label className="gis-opt">
            <input type="checkbox" checked={districtsOn} onChange={(e) => setDistrictsOn(e.target.checked)} />
            {t.pg_gis_districts}
          </label>
        </section>

        <section>
          <h2>{t.pg_gis_crops}</h2>
          <label className="gis-search">
            <Search size={16} />
            <input
              value={cropQuery}
              onChange={(e) => setCropQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && cropSuggestions[0]) applyCropFocus(cropSuggestions[0]);
              }}
              placeholder={t.pg_gis_crop_search || 'Search crop…'}
            />
          </label>
          {cropSuggestions.length > 0 && (
            <ul className="gis-suggest">
              {cropSuggestions.map((crop) => (
                <li key={crop}>
                  <button type="button" onClick={() => applyCropFocus(crop)}>
                    {crop}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cropFocus && (
            <>
              <button type="button" className="gis-chip-clear" onClick={() => setCropFocus('')}>
                {cropFocus} · {t.pg_gis_crop_clear || 'Clear crop'}
              </button>
              <p className="gis-legend-note">{t.pg_gis_crop_legend || 'Listed for this crop'}</p>
              <ul className="gis-legend gis-legend-crops">
                {cropMatchStates.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        {soilOn && (
          <section>
            <h2>{t.pg_gis_legend}</h2>
            <ul className="gis-legend">
              {Object.values(SOIL_GROUPS).map((group) => (
                <li key={group.id}>
                  <span style={{ background: group.color }} />
                  {t[`soil_${group.id}`] || group.label}
                </li>
              ))}
            </ul>
            <p className="gis-src">{GIS_SOURCES.soil}</p>
          </section>
        )}

        {cropOn && !soilOn && !cropFocus && (
          <p className="gis-src">{GIS_SOURCES.crops}</p>
        )}

        <p className="gis-src">{GIS_SOURCES.boundaries}</p>
        <p className="gis-src">{BASEMAPS[basemap].attr}</p>
      </aside>

      <aside
        ref={rightRailRef}
        className={`gis-rail gis-rail-right${rightOpen ? ' is-open' : ''}`}
      >
        <nav className="gis-crumb" aria-label={t.pg_gis_crumb_india || 'India'}>
          <button type="button" className="gis-close gis-close-mobile" onClick={() => setRightOpen(false)} aria-label={t.pg_gis_clear}>
            <X size={16} />
          </button>
          <button type="button" onClick={goIndia}>{t.pg_gis_crumb_india || 'India'}</button>
          {stateLabel && (
            <>
              <span aria-hidden="true">↓</span>
              <button type="button" onClick={zoomToSelectedState}>{stateLabel}</button>
            </>
          )}
          {selected?.kind === 'district' && (
            <>
              <span aria-hidden="true">↓</span>
              <span>{selected.name}</span>
            </>
          )}
        </nav>

        {!selected && (
          <div className="gis-empty">
            <MapPin size={22} />
            <h2>{t.pg_gis_pick}</h2>
            <p>{t.pg_gis_pick_p}</p>
            <button type="button" className="gis-analyze gis-sat-link" onClick={openSatellite}>
              <Satellite size={14} /> {t.pg_gis_open_sat}
            </button>
          </div>
        )}

        {selected && (
          <article className="gis-place">
            <header>
              <p>{selected.kind === 'district' ? t.pg_gis_district : t.pg_gis_state}</p>
              <h2>{selected.name}</h2>
              {selected.parentName && <p>{selected.parentName}</p>}
              <button type="button" className="gis-close" onClick={() => setSelected(null)} aria-label={t.pg_gis_clear}>
                <X size={16} />
              </button>
            </header>

            {agri ? (
              <>
                {agri.region && <p className="gis-region">{agri.region}</p>}
                <h3>{t.pg_gis_soil}</h3>
                <p className="gis-soil">
                  <span style={{ background: agri.soil.color }} />
                  {t[`soil_${agri.soil.id}`] || agri.soil.label}
                </p>
                <dl>
                  {agri.soil.texture && (
                    <div>
                      <dt>{t.pg_gis_texture}</dt>
                      <dd>{agri.soil.texture}</dd>
                    </div>
                  )}
                  {agri.soil.fertility && (
                    <div>
                      <dt>{t.pg_gis_fertility}</dt>
                      <dd>{agri.soil.fertility}</dd>
                    </div>
                  )}
                  {agri.soil.phRange && (
                    <div>
                      <dt>{t.pg_gis_ph}</dt>
                      <dd>{agri.soil.phRange}</dd>
                    </div>
                  )}
                  {agri.soil.organicCarbon && (
                    <div>
                      <dt>{t.pg_gis_oc}</dt>
                      <dd>{agri.soil.organicCarbon}</dd>
                    </div>
                  )}
                </dl>
                {agri.soil.note && <p className="gis-note">{agri.soil.note}</p>}
                {selected.kind === 'district' && (
                  <p className="gis-src">{t.pg_gis_district_soil}</p>
                )}

                <h3>{t.pg_gis_suitable}</h3>
                <ul className="gis-crops">
                  {agri.crops.map((crop) => (
                    <li key={crop}>
                      <button type="button" onClick={() => applyCropFocus(crop)}>{crop}</button>
                    </li>
                  ))}
                </ul>
                <p className="gis-src">{GIS_SOURCES.crops}</p>
                <button type="button" className="gis-analyze" onClick={() => navigate('/app/analyze')}>
                  {t.pg_gis_explore || t.pg_analyze_h}
                </button>
                <button type="button" className="gis-analyze gis-sat-link" onClick={openSatellite}>
                  <Satellite size={14} /> {t.pg_gis_open_sat}
                </button>
              </>
            ) : (
              <>
                <p className="gis-src">{t.pg_gis_no_agri}</p>
                <button type="button" className="gis-analyze gis-sat-link" onClick={openSatellite}>
                  <Satellite size={14} /> {t.pg_gis_open_sat}
                </button>
              </>
            )}
          </article>
        )}
      </aside>

      <div ref={chromeRef} className="gis-chrome">
        <div className="gis-fabs">
          <button
            type="button"
            className={`gis-fab${leftOpen ? ' is-active' : ''}`}
            onClick={() => setLeftOpen((open) => !open)}
          >
            <Layers size={15} /> {t.pg_gis_layers_toggle || t.nav_gis}
          </button>
          <button
            type="button"
            className={`gis-fab${rightOpen ? ' is-active' : ''}`}
            onClick={() => setRightOpen((open) => !open)}
          >
            <MapPin size={15} /> {t.pg_gis_info_toggle || t.pg_gis_pick}
          </button>
          <button type="button" className="gis-fab" onClick={openSatellite}>
            <Satellite size={15} /> {t.pg_gis_satellite}
          </button>
        </div>
        <button type="button" className="gis-india-float" onClick={goIndia}>
          <LocateFixed size={14} /> {t.pg_gis_india}
        </button>
      </div>

      {loadError && <p className="gis-banner">{loadError}</p>}
    </div>
  );
}
