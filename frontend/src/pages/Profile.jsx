import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { LANGUAGES } from '../data/indiaLocations';
import PageHeader from '../components/PageHeader';
import { saveAlertEmail } from '../utils/telemetry';

function Row({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { farmer, logout, setSession } = useAuth();
  const { lang, setLang, t } = useLang();
  const p = farmer?.profile || {};
  const [email, setEmail] = useState(p.email || '');
  const [emailNote, setEmailNote] = useState('');
  const [saving, setSaving] = useState(false);

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const onSaveEmail = async (e) => {
    e.preventDefault();
    setSaving(true);
    setEmailNote('');
    try {
      const data = await saveAlertEmail(email.trim());
      setSession({ token: farmer?.token, farmer: data.farmer });
      setEmailNote(t.pg_email_saved);
    } catch {
      setEmailNote(t.pg_map_fail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="farm-page">
      <PageHeader kicker={t.pg_account} title={t.pg_profile_h} lede={t.pg_profile_p} />

      <section className="az-group">
        <h2>{t.pg_personal}</h2>
        <dl className="profile-dl">
          <Row label={t.pg_name} value={p.fullName || farmer?.name} />
          <Row label={t.pg_mobile} value={farmer?.phone} />
          <Row label={t.pg_age} value={p.age} />
          <Row label={t.pg_gender} value={p.gender} />
        </dl>
      </section>

      <section className="az-group">
        <h2>{t.pg_email}</h2>
        <p className="az-meta">{t.pg_email_p}</p>
        <form onSubmit={onSaveEmail} className="auth-field" style={{ marginTop: '0.85rem' }}>
          <label htmlFor="alert-email">{t.label_email}</label>
          <input
            id="alert-email"
            type="email"
            className="az-select"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{ appearance: 'auto' }}
          />
          <button type="submit" className="btn-primary" style={{ marginTop: '0.75rem' }} disabled={saving}>
            {t.pg_email_save}
          </button>
          {emailNote && <p className="farm-note">{emailNote}</p>}
        </form>
      </section>

      <section className="az-group">
        <h2>{t.pg_location}</h2>
        <dl className="profile-dl">
          <Row label={t.pg_mkt_state} value={p.state} />
          <Row label={t.pg_mkt_district} value={p.district} />
          <Row label={t.pg_village} value={p.village || farmer?.village} />
          <Row label={t.pg_pin} value={p.pincode} />
        </dl>
      </section>

      <section className="az-group">
        <h2>{t.pg_farm}</h2>
        <dl className="profile-dl">
          <Row label={t.pg_farm_name} value={p.farmName} />
          <Row label={t.pg_size} value={p.farmSize ? `${p.farmSize} ${p.farmSizeUnit || ''}`.trim() : ''} />
          <Row label={t.pg_primary} value={p.primaryCrop} />
          <Row label={t.pg_soil_type} value={p.soilType} />
        </dl>
      </section>

      <section className="az-group">
        <h2>{t.pg_pref}</h2>
        <label className="auth-field" htmlFor="profile-lang" style={{ margin: 0 }}>
          <span>{t.pg_pref_lang}</span>
          <select
            id="profile-lang"
            className="az-select"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            style={{ appearance: 'auto', paddingRight: '0.9rem' }}
          >
            {LANGUAGES.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="az-group">
        <h2>{t.pg_account}</h2>
        <button type="button" className="btn-secondary" onClick={onLogout}>
          <LogOut size={16} /> {t.pg_sign_out}
        </button>
      </section>
    </div>
  );
}
