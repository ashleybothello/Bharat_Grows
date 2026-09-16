import { useEffect, useState } from 'react';
import { LocateFixed, Loader2 } from 'lucide-react';
import { STATES, districtsFor, talukasFor } from '../../data/indiaLocations';
import { useLang } from '../../context/LanguageContext';

function matchName(value, list) {
  if (!value || !list?.length) return '';
  const needle = value.toLowerCase();
  return list.find((item) => item.toLowerCase() === needle)
    || list.find((item) => item.toLowerCase().includes(needle))
    || '';
}

function SearchSelect({ id, label, value, options, disabled, error, placeholder, emptyLabel, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const filtered = options.filter((item) => item.toLowerCase().includes(query.trim().toLowerCase()));

  const choose = (item) => {
    onChange(item);
    setQuery(item);
    setOpen(false);
  };

  return (
    <div className={`auth-field auth-combobox${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (!next.trim()) onChange('');
        }}
        onBlur={() => {
          const exact = options.find((item) => item.toLowerCase() === query.trim().toLowerCase());
          if (exact) choose(exact);
          else setQuery(value || '');
          setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && !disabled && (
        <ul id={`${id}-list`} className="auth-suggest" role="listbox">
          {filtered.slice(0, 14).map((item) => (
            <li
              key={item}
              role="option"
              aria-selected={item === value}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
            >
              {item}
            </li>
          ))}
          {filtered.length === 0 ? <li className="is-empty">{emptyLabel}</li> : null}
        </ul>
      )}
      {error ? <p className="auth-error-text">{error}</p> : null}
    </div>
  );
}

export default function LocationSelector({ values, onChange, errors = {} }) {
  const { t } = useLang();
  const [geoMsg, setGeoMsg] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const districts = districtsFor(values.state);
  const talukas = talukasFor(values.state, values.district);

  const patch = (next) => onChange({ ...values, ...next });

  const useLocation = async () => {
    if (!navigator.geolocation) {
      setGeoMsg(t.geo_unavailable);
      return;
    }
    setGeoLoading(true);
    setGeoMsg('');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      patch({ latitude, longitude });
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
          { headers: { Accept: 'application/json' } },
        );
        const data = await res.json();
        const addr = data.address || {};
        const state = matchName(addr.state, STATES);
        const districtList = districtsFor(state);
        const district = matchName(addr.county || addr.state_district || addr.city_district, districtList);
        patch({
          latitude,
          longitude,
          state: state || values.state,
          district: district || values.district,
          taluka: addr.municipality || addr.town || values.taluka,
          village: addr.village || addr.suburb || addr.city || values.village,
          pincode: addr.postcode?.replace(/\D/g, '').slice(0, 6) || values.pincode,
        });
        setGeoMsg(t.geo_filled);
      } catch {
        setGeoMsg(t.geo_coords);
      } finally {
        setGeoLoading(false);
      }
    }, () => {
      setGeoLoading(false);
      setGeoMsg(t.geo_denied);
    }, { enableHighAccuracy: false, timeout: 10000 });
  };

  return (
    <div className="auth-grid">
      <div className="auth-span-2">
        <button type="button" className="auth-ghost" onClick={useLocation} disabled={geoLoading}>
          {geoLoading ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
          {t.geo_use}
        </button>
        {geoMsg ? <p className="auth-hint">{geoMsg}</p> : null}
      </div>

      <SearchSelect
        id="farm-state"
        label={t.label_state}
        value={values.state}
        options={STATES}
        error={errors.state}
        placeholder={t.ph_state}
        emptyLabel={t.no_matches}
        onChange={(state) => patch({ state, district: '', taluka: '' })}
      />

      <SearchSelect
        id="farm-district"
        label={t.label_district}
        value={values.district}
        options={districts}
        disabled={!values.state}
        error={errors.district}
        placeholder={values.state ? t.ph_district : t.ph_district_first}
        emptyLabel={t.no_matches}
        onChange={(district) => patch({ district, taluka: '' })}
      />

      <div className={`auth-field${errors.taluka ? ' has-error' : ''}`}>
        <label htmlFor="farm-taluka">{t.label_taluka}</label>
        <input
          id="farm-taluka"
          list="taluka-options"
          value={values.taluka}
          disabled={!values.district}
          placeholder={values.district ? t.ph_taluka : t.ph_taluka_first}
          onChange={(e) => patch({ taluka: e.target.value })}
        />
        <datalist id="taluka-options">
          {talukas.map((item) => <option key={item} value={item} />)}
        </datalist>
        {errors.taluka ? <p className="auth-error-text">{errors.taluka}</p> : null}
      </div>

      <div className={`auth-field${errors.village ? ' has-error' : ''}`}>
        <label htmlFor="farm-village">{t.label_village}</label>
        <input
          id="farm-village"
          value={values.village}
          placeholder={t.ph_village}
          onChange={(e) => patch({ village: e.target.value })}
        />
        {errors.village ? <p className="auth-error-text">{errors.village}</p> : null}
      </div>

      <div className={`auth-field${errors.pincode ? ' has-error' : ''}`}>
        <label htmlFor="farm-pin">{t.label_pincode}</label>
        <input
          id="farm-pin"
          inputMode="numeric"
          maxLength={6}
          value={values.pincode}
          placeholder={t.ph_pin}
          onChange={(e) => patch({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
        />
        {errors.pincode ? <p className="auth-error-text">{errors.pincode}</p> : null}
      </div>

      <div className="auth-field">
        <label htmlFor="farm-name">{t.label_farm_name}</label>
        <input
          id="farm-name"
          value={values.farmName}
          placeholder={t.opt_optional}
          onChange={(e) => patch({ farmName: e.target.value })}
        />
      </div>
    </div>
  );
}
