import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Loader2, Sprout } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout';
import PhoneInput from '../components/auth/PhoneInput';
import OTPInput from '../components/auth/OTPInput';
import StepIndicator from '../components/auth/StepIndicator';
import LocationSelector from '../components/auth/LocationSelector';
import { LANGUAGES } from '../data/indiaLocations';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { registerProfile, resendOtp, verifyOtp, authI18nKey, isIndianMobile, normalizeMobile } from '../utils/auth';
import './auth.css';

const STEP_KEYS = ['step_you', 'step_location', 'step_farm', 'step_crops', 'step_prefs'];
const DRAFT_KEY = 'bharatgrow_signup_draft';
const ease = [0.16, 1, 0.3, 1];

const INTERESTS = [
  { value: 'Crop recommendations', key: 'interest_crop' },
  { value: 'Soil analysis', key: 'interest_soil' },
  { value: 'Weather alerts', key: 'interest_weather' },
  { value: 'Irrigation recommendations', key: 'interest_irrigation' },
  { value: 'Pest/disease detection', key: 'interest_pest' },
  { value: 'Market information', key: 'interest_market' },
  { value: 'Government schemes', key: 'interest_schemes' },
  { value: 'AI farming assistant', key: 'interest_ai' },
];

const TECH = [
  { value: 'IoT Sensors', key: 'tech_iot' },
  { value: 'Weather Station', key: 'tech_weather' },
  { value: 'Drip Automation', key: 'tech_drip' },
  { value: 'Soil Testing', key: 'tech_soil' },
  { value: 'Satellite Monitoring', key: 'tech_sat' },
  { value: 'Other', key: 'tech_other' },
];

const SOILS = [
  { value: 'Black Soil', key: 'soil_black' },
  { value: 'Alluvial Soil', key: 'soil_alluvial' },
  { value: 'Red Soil', key: 'soil_red' },
  { value: 'Laterite Soil', key: 'soil_laterite' },
  { value: 'Sandy Soil', key: 'soil_sandy' },
  { value: 'Loamy Soil', key: 'soil_loamy' },
  { value: 'Clay Soil', key: 'soil_clay' },
  { value: 'Other', key: 'soil_other' },
  { value: "Don't know", key: 'soil_unknown' },
];

const IRRIGATIONS = [
  { value: 'Borewell', key: 'irr_bore' },
  { value: 'Open Well', key: 'irr_well' },
  { value: 'Canal', key: 'irr_canal' },
  { value: 'Rain-fed', key: 'irr_rain' },
  { value: 'Drip Irrigation', key: 'irr_drip' },
  { value: 'Sprinkler', key: 'irr_sprinkler' },
  { value: 'River', key: 'irr_river' },
  { value: 'Other', key: 'irr_other' },
];

const WATERS = [
  { value: 'Very Low', key: 'water_vl' },
  { value: 'Low', key: 'water_l' },
  { value: 'Moderate', key: 'water_m' },
  { value: 'Good', key: 'water_g' },
  { value: 'Excellent', key: 'water_e' },
];

const STAGES = [
  { value: 'Land Preparation', key: 'stage_prep' },
  { value: 'Sowing', key: 'stage_sow' },
  { value: 'Germination', key: 'stage_germ' },
  { value: 'Vegetative Growth', key: 'stage_veg' },
  { value: 'Flowering', key: 'stage_flower' },
  { value: 'Fruiting', key: 'stage_fruit' },
  { value: 'Harvest', key: 'stage_harvest' },
  { value: 'Post Harvest', key: 'stage_post' },
];

const INITIAL = {
  fullName: '',
  phone: '',
  email: '',
  age: '',
  gender: '',
  preferredLanguage: 'en',
  state: '',
  district: '',
  taluka: '',
  village: '',
  pincode: '',
  farmName: '',
  latitude: '',
  longitude: '',
  farmSize: '',
  farmSizeUnit: 'Acres',
  ownership: '',
  soilType: '',
  irrigationSource: '',
  waterAvailability: '',
  primaryCrop: '',
  secondaryCrops: '',
  farmingType: '',
  experience: '',
  currentSeason: '',
  cropStage: '',
  usesSmartFarming: '',
  technologiesUsed: [],
  governmentSchemes: '',
  interests: [],
  preferredCommunication: [],
};

function maskPhone(phone) {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

function toggleItem(list, item) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Field({ id, label, error, children }) {
  return (
    <div className={`auth-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <p className="auth-error-text">{error}</p> : null}
    </div>
  );
}

export default function Signup() {
  const navigate = useNavigate();
  const { isAuthed, setSession } = useAuth();
  const { setLang, t, lang } = useLang();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => {
    try {
      return { ...INITIAL, preferredLanguage: localStorage.getItem('soilai_lang') || 'en', ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') };
    } catch {
      return INITIAL;
    }
  });
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState('form');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const fail = (data, network = false) => t[authI18nKey(data, network)];
  const steps = STEP_KEYS.map((key) => t[key]);

  useEffect(() => {
    if (isAuthed && phase !== 'success') navigate('/app/dashboard', { replace: true });
  }, [isAuthed, navigate, phase]);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    setForm((prev) => (prev.preferredLanguage === lang ? prev : { ...prev, preferredLanguage: lang }));
  }, [lang]);

  useEffect(() => {
    if (resendTimer <= 0) return undefined;
    const timer = setTimeout(() => setResendTimer((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const patch = (next) => setForm((prev) => ({ ...prev, ...next }));

  const validators = useMemo(() => ([
    () => {
      const next = {};
      if (!form.fullName.trim() || form.fullName.trim().length < 2) next.fullName = t.val_name;
      if (!isIndianMobile(form.phone)) next.phone = t.val_mobile;
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = t.val_email;
      if (form.age && (Number(form.age) < 15 || Number(form.age) > 100)) next.age = t.val_age;
      if (!form.preferredLanguage) next.preferredLanguage = t.val_lang;
      return next;
    },
    () => {
      const next = {};
      if (!form.state) next.state = t.val_state;
      if (!form.district) next.district = t.val_district;
      if (!form.taluka.trim()) next.taluka = t.val_taluka;
      if (!form.village.trim()) next.village = t.val_village;
      if (!/^\d{6}$/.test(form.pincode)) next.pincode = t.val_pin;
      return next;
    },
    () => {
      const next = {};
      if (!(Number(form.farmSize) > 0)) next.farmSize = t.val_farm;
      return next;
    },
    () => {
      const next = {};
      if (!form.primaryCrop.trim()) next.primaryCrop = t.val_crop;
      return next;
    },
    () => ({}),
  ]), [form, t]);

  const goNext = () => {
    const nextErrors = validators[step]();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (form.preferredLanguage) setLang(form.preferredLanguage);
    setStep((n) => Math.min(n + 1, STEP_KEYS.length));
  };

  const startOtp = async () => {
    const all = validators.reduce((acc, fn) => ({ ...acc, ...fn() }), {});
    setErrors(all);
    if (Object.keys(all).length) {
      setError(t.val_complete);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { ok, data } = await registerProfile({ ...form, phone: normalizeMobile(form.phone) });
      if (ok && data.success) {
        setPhase('otp');
        setOtp('');
        setResendTimer(60);
      } else if (data?.code === 'ACCOUNT_ALREADY_EXISTS') {
        setPhase('exists');
        setError('');
      } else {
        setError(fail(data));
      }
    } catch {
      setError(fail(null, true));
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (code = otp) => {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setError('');
    setOtpError(false);
    try {
      const { ok, data } = await verifyOtp({
        phone: form.phone,
        otp: code,
        name: form.fullName,
        village: form.village,
        purpose: 'signup',
      });
      if (ok && data.success) {
        sessionStorage.removeItem(DRAFT_KEY);
        setSession(data);
        setPhase('success');
      } else {
        setOtpError(true);
        setOtp('');
        setError(fail(data));
      }
    } catch {
      setError(fail(null, true));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const { ok, data } = await resendOtp(form.phone, 'signup');
      if (ok && data.success) {
        setResendTimer(60);
        setOtp('');
      } else if (data?.code === 'ACCOUNT_ALREADY_EXISTS') {
        setPhase('exists');
      } else {
        setError(fail(data));
      }
    } catch {
      setError(fail(null, true));
    } finally {
      setLoading(false);
    }
  };

  const onReview = step === STEP_KEYS.length && phase === 'form';

  return (
    <AuthLayout variant="signup">
      <motion.div className="auth-board" initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.55, ease }}>
        {phase === 'form' && (
          <>
            <h1>{onReview ? t.signup_review_h1 : t.signup_h1}</h1>
            <p className="auth-lead">
              {onReview ? t.signup_review_lead : t.signup_lead}
            </p>
            <StepIndicator steps={steps} current={Math.min(step, STEP_KEYS.length - 1)} ariaLabel={t.aria_progress} />
          </>
        )}

        <AnimatePresence mode="wait">
          {phase === 'exists' ? (
            <motion.div key="exists" className="auth-gate" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
              <h1>{t.exists_h1}</h1>
              <p className="auth-lead">{t.exists_lead}</p>
              <div className="auth-gate-actions">
                <Link className="auth-btn auth-btn-block" to="/login">
                  {t.exists_signin} <ArrowUpRight size={16} />
                </Link>
                <button
                  type="button"
                  className="auth-secondary"
                  onClick={() => {
                    setPhase('form');
                    setStep(0);
                    setError('');
                    patch({ phone: '' });
                  }}
                >
                  {t.exists_another}
                </button>
              </div>
            </motion.div>
          ) : phase === 'success' ? (
            <motion.div key="ok" className="auth-success" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
              <Sprout size={28} color="var(--auth-leaf, #2c5a3c)" />
              <h1>{t.success_h1}</h1>
              <p className="auth-lead">{t.success_lead}</p>
              <button className="auth-btn" type="button" onClick={() => navigate('/app/dashboard', { replace: true })}>
                {t.success_enter} <ArrowUpRight size={16} />
              </button>
            </motion.div>
          ) : phase === 'otp' ? (
            <motion.form key="otp" onSubmit={(e) => { e.preventDefault(); submitOtp(); }} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
              <h1>{t.otp_h1}</h1>
              <p className="auth-lead">{typeof t.otp_lead === 'function' ? t.otp_lead(maskPhone(form.phone)) : t.otp_lead}</p>
              <OTPInput
                value={otp}
                error={otpError}
                disabled={loading}
                onChange={(code) => {
                  setOtp(code);
                  setOtpError(false);
                  if (code.length === 6) submitOtp(code);
                }}
              />
              <button className="auth-btn auth-btn-block" type="submit" disabled={loading || otp.length !== 6}>
                {loading ? <><Loader2 size={18} className="animate-spin" /> {t.otp_verifying}</> : <>{t.otp_verify} <ArrowUpRight size={16} /></>}
              </button>
              {error ? <p className="auth-banner error" role="alert">{error}</p> : null}
              <div className="auth-actions">
                <button type="button" className="auth-secondary" onClick={handleResend} disabled={resendTimer > 0 || loading}>
                  {resendTimer > 0 ? (typeof t.otp_resend_in === 'function' ? t.otp_resend_in(resendTimer) : t.otp_resend) : t.otp_resend}
                </button>
                <button type="button" className="auth-secondary" onClick={() => { setPhase('form'); setStep(0); setError(''); }}>
                  {t.otp_change}
                </button>
              </div>
            </motion.form>
          ) : onReview ? (
            <motion.div key="review" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
              <div className="auth-review">
                <article>
                  <h3>{t.review_farmer}</h3>
                  <p>{form.fullName}</p>
                  <p>+91 {form.phone}</p>
                  <button type="button" onClick={() => setStep(0)}>{t.review_edit}</button>
                </article>
                <article>
                  <h3>{t.review_location}</h3>
                  <p>{[form.village, form.taluka, form.district, form.state, form.pincode].filter(Boolean).join(', ')}</p>
                  <button type="button" onClick={() => setStep(1)}>{t.review_edit}</button>
                </article>
                <article>
                  <h3>{t.review_farm}</h3>
                  <p>{form.farmSize} {form.farmSizeUnit}</p>
                  <p>{[form.soilType, form.irrigationSource, form.ownership].filter(Boolean).join(' · ') || t.review_optional}</p>
                  <button type="button" onClick={() => setStep(2)}>{t.review_edit}</button>
                </article>
                <article>
                  <h3>{t.review_crops}</h3>
                  <p>{form.primaryCrop}{form.secondaryCrops ? ` · ${form.secondaryCrops}` : ''}</p>
                  <p>{[form.farmingType, form.experience].filter(Boolean).join(' · ')}</p>
                  <button type="button" onClick={() => setStep(3)}>{t.review_edit}</button>
                </article>
              </div>
              {error ? <p className="auth-banner error" role="alert">{error}</p> : null}
              <div className="auth-actions">
                <button type="button" className="auth-secondary" onClick={() => setStep(STEP_KEYS.length - 1)}>{t.btn_back}</button>
                <button type="button" className="auth-btn" onClick={startOtp} disabled={loading}>
                  {loading ? <><Loader2 size={18} className="animate-spin" /> {t.creating}</> : <>{t.create_profile} <ArrowUpRight size={16} /></>}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              {step === 0 && (
                <div className="auth-grid">
                  <Field id="fullName" label={t.label_full_name} error={errors.fullName}>
                    <input id="fullName" value={form.fullName} autoComplete="name" onChange={(e) => patch({ fullName: e.target.value })} />
                  </Field>
                  <PhoneInput value={form.phone} onChange={(phone) => patch({ phone: normalizeMobile(phone) })} error={errors.phone} />
                  <Field id="email" label={t.label_email} error={errors.email}>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => patch({ email: e.target.value })}
                    />
                  </Field>
                  <Field id="age" label={t.label_age} error={errors.age}>
                    <input id="age" inputMode="numeric" value={form.age} onChange={(e) => patch({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                  </Field>
                  <Field id="gender" label={t.label_gender}>
                    <select id="gender" value={form.gender} onChange={(e) => patch({ gender: e.target.value })}>
                      <option value="">{t.opt_optional}</option>
                      <option value="Male">{t.opt_male}</option>
                      <option value="Female">{t.opt_female}</option>
                      <option value="Other">{t.opt_other}</option>
                      <option value="Prefer not to say">{t.opt_prefer_not}</option>
                    </select>
                  </Field>
                  <div className="auth-span-2">
                    <Field id="lang" label={t.label_lang} error={errors.preferredLanguage}>
                      <select id="lang" value={form.preferredLanguage} onChange={(e) => { patch({ preferredLanguage: e.target.value }); setLang(e.target.value); }}>
                        {LANGUAGES.map((lang) => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {step === 1 && (
                <LocationSelector values={form} onChange={setForm} errors={errors} />
              )}

              {step === 2 && (
                <div className="auth-grid">
                  <Field id="farmSize" label={t.label_farm_size} error={errors.farmSize}>
                    <input id="farmSize" inputMode="decimal" value={form.farmSize} onChange={(e) => patch({ farmSize: e.target.value })} />
                  </Field>
                  <Field id="unit" label={t.label_unit}>
                    <select id="unit" value={form.farmSizeUnit} onChange={(e) => patch({ farmSizeUnit: e.target.value })}>
                      <option value="Acres">{t.opt_acres}</option>
                      <option value="Hectares">{t.opt_hectares}</option>
                    </select>
                  </Field>
                  <Field id="own" label={t.label_ownership}>
                    <select id="own" value={form.ownership} onChange={(e) => patch({ ownership: e.target.value })}>
                      <option value="">{t.opt_optional}</option>
                      <option value="Owned">{t.opt_owned}</option>
                      <option value="Leased">{t.opt_leased}</option>
                      <option value="Shared">{t.opt_shared}</option>
                      <option value="Other">{t.opt_other}</option>
                    </select>
                  </Field>
                  <Field id="soil" label={t.label_soil}>
                    <select id="soil" value={form.soilType} onChange={(e) => patch({ soilType: e.target.value })}>
                      <option value="">{t.opt_optional}</option>
                      {SOILS.map((item) => <option key={item.value} value={item.value}>{t[item.key]}</option>)}
                    </select>
                  </Field>
                  <Field id="irr" label={t.label_irrigation}>
                    <select id="irr" value={form.irrigationSource} onChange={(e) => patch({ irrigationSource: e.target.value })}>
                      <option value="">{t.opt_optional}</option>
                      {IRRIGATIONS.map((item) => <option key={item.value} value={item.value}>{t[item.key]}</option>)}
                    </select>
                  </Field>
                  <Field id="water" label={t.label_water}>
                    <select id="water" value={form.waterAvailability} onChange={(e) => patch({ waterAvailability: e.target.value })}>
                      <option value="">{t.opt_optional}</option>
                      {WATERS.map((item) => <option key={item.value} value={item.value}>{t[item.key]}</option>)}
                    </select>
                  </Field>
                </div>
              )}

              {step === 3 && (
                <div className="auth-grid">
                  <Field id="crop" label={t.label_primary} error={errors.primaryCrop}>
                    <input id="crop" value={form.primaryCrop} placeholder={t.ph_primary} onChange={(e) => patch({ primaryCrop: e.target.value })} />
                  </Field>
                  <Field id="sec" label={t.label_secondary}>
                    <input id="sec" value={form.secondaryCrops} placeholder={t.ph_secondary} onChange={(e) => patch({ secondaryCrops: e.target.value })} />
                  </Field>
                  <Field id="type" label={t.label_farming_type}>
                    <select id="type" value={form.farmingType} onChange={(e) => patch({ farmingType: e.target.value })}>
                      <option value="">{t.opt_optional}</option>
                      <option value="Conventional">{t.opt_conventional}</option>
                      <option value="Organic">{t.opt_organic}</option>
                      <option value="Mixed">{t.opt_mixed}</option>
                      <option value="Natural Farming">{t.opt_natural}</option>
                    </select>
                  </Field>
                  <Field id="exp" label={t.label_experience}>
                    <select id="exp" value={form.experience} onChange={(e) => patch({ experience: e.target.value })}>
                      <option value="">{t.opt_optional}</option>
                      <option value="Less than 2 years">{t.exp_lt2}</option>
                      <option value="2–5 years">{t.exp_2_5}</option>
                      <option value="5–10 years">{t.exp_5_10}</option>
                      <option value="10+ years">{t.exp_10}</option>
                    </select>
                  </Field>
                  <Field id="season" label={t.label_season}>
                    <input id="season" value={form.currentSeason} placeholder={t.ph_season} onChange={(e) => patch({ currentSeason: e.target.value })} />
                  </Field>
                  <Field id="stage" label={t.label_stage}>
                    <select id="stage" value={form.cropStage} onChange={(e) => patch({ cropStage: e.target.value })}>
                      <option value="">{t.opt_optional}</option>
                      {STAGES.map((item) => <option key={item.value} value={item.value}>{t[item.key]}</option>)}
                    </select>
                  </Field>
                  <div className="auth-span-2">
                    <Field id="smart" label={t.label_smart}>
                      <select id="smart" value={form.usesSmartFarming} onChange={(e) => patch({ usesSmartFarming: e.target.value, technologiesUsed: e.target.value === 'Yes' ? form.technologiesUsed : [] })}>
                        <option value="">{t.opt_optional}</option>
                        <option value="Yes">{t.opt_yes}</option>
                        <option value="No">{t.opt_no}</option>
                        <option value="Planning to">{t.opt_planning}</option>
                      </select>
                    </Field>
                    {form.usesSmartFarming === 'Yes' && (
                      <div className="chip-row">
                        {TECH.map((item) => (
                          <label key={item.value}>
                            <input
                              type="checkbox"
                              checked={form.technologiesUsed.includes(item.value)}
                              onChange={() => patch({ technologiesUsed: toggleItem(form.technologiesUsed, item.value) })}
                            />
                            {t[item.key]}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <Field id="schemes" label={t.label_schemes}>
                    <select id="schemes" value={form.governmentSchemes} onChange={(e) => patch({ governmentSchemes: e.target.value })}>
                      <option value="">{t.opt_optional}</option>
                      <option value="Yes">{t.opt_yes}</option>
                      <option value="No">{t.opt_no}</option>
                    </select>
                  </Field>
                  <p className="auth-hint">{t.hint_interested}</p>
                  <div className="chip-row">
                    {INTERESTS.map((item) => (
                      <label key={item.value}>
                        <input
                          type="checkbox"
                          checked={form.interests.includes(item.value)}
                          onChange={() => patch({ interests: toggleItem(form.interests, item.value) })}
                        />
                        {t[item.key]}
                      </label>
                    ))}
                  </div>
                  <p className="auth-hint" style={{ marginTop: '1rem' }}>{t.hint_comm}</p>
                  <div className="chip-row">
                    {[
                      { value: 'App', key: 'comm_app' },
                      { value: 'WhatsApp', key: 'comm_wa' },
                      { value: 'SMS', key: 'comm_sms' },
                      { value: 'Voice', key: 'comm_voice' },
                    ].map((item) => (
                      <label key={item.value}>
                        <input
                          type="checkbox"
                          checked={form.preferredCommunication.includes(item.value)}
                          onChange={() => patch({ preferredCommunication: toggleItem(form.preferredCommunication, item.value) })}
                        />
                        {t[item.key]}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="auth-actions">
                {step > 0 && (
                  <button type="button" className="auth-secondary" onClick={() => setStep((n) => n - 1)}>{t.btn_back}</button>
                )}
                <button type="button" className="auth-btn" onClick={goNext}>
                  {t.btn_continue} <ArrowUpRight size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'form' && (
          <p className="auth-switch">
            {t.signup_switch} <Link to="/login">{t.lp_sign_in}</Link>
          </p>
        )}
      </motion.div>
    </AuthLayout>
  );
}
