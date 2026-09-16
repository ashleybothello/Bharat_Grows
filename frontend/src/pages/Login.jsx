import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout';
import PhoneInput from '../components/auth/PhoneInput';
import OTPInput from '../components/auth/OTPInput';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { sendOtp, resendOtp, verifyOtp, authI18nKey, isIndianMobile, normalizeMobile } from '../utils/auth';
import './auth.css';

const ease = [0.16, 1, 0.3, 1];

function maskPhone(phone) {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

export default function Login() {
  const navigate = useNavigate();
  const { isAuthed, setSession } = useAuth();
  const { t } = useLang();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const fail = (data, network = false) => t[authI18nKey(data, network)];

  useEffect(() => {
    if (isAuthed) navigate('/app/dashboard', { replace: true });
  }, [isAuthed, navigate]);

  useEffect(() => {
    if (resendTimer <= 0) return undefined;
    const timer = setTimeout(() => setResendTimer((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  useEffect(() => {
    const fill = (e) => {
      setPhone(normalizeMobile(e.detail));
      setError('');
    };
    window.addEventListener('fill_phone', fill);
    return () => window.removeEventListener('fill_phone', fill);
  }, []);

  const submitPhone = async (e) => {
    e?.preventDefault();
    const mobile = normalizeMobile(phone);
    setPhone(mobile);
    if (!isIndianMobile(mobile)) {
      setError(t.val_mobile);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { ok, data } = await sendOtp(mobile, 'login');
      if (ok && data.success) {
        setStep('otp');
        setOtp('');
        setResendTimer(60);
      } else if (data?.code === 'ACCOUNT_NOT_FOUND') {
        setStep('notfound');
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
      const { ok, data } = await verifyOtp({ phone, otp: code, purpose: 'login' });
      if (ok && data.success) {
        setSession(data);
        navigate('/app/dashboard', { replace: true });
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
      const { ok, data } = await resendOtp(phone, 'login');
      if (ok && data.success) {
        setResendTimer(60);
        setOtp('');
      } else {
        setError(fail(data));
      }
    } catch {
      setError(fail(null, true));
    } finally {
      setLoading(false);
    }
  };

  const resetToPhone = () => {
    setStep('phone');
    setError('');
    setOtp('');
    setOtpError(false);
  };

  return (
    <AuthLayout>
      <motion.div className="auth-board" initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.55, ease }}>
        <AnimatePresence mode="wait">
          {step === 'notfound' ? (
            <motion.div key="notfound" className="auth-gate" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.32, ease }}>
              <h1>{t.login_notfound_h1}</h1>
              <p className="auth-lead">{t.login_notfound_lead}</p>
              <div className="auth-gate-actions">
                <Link className="auth-btn auth-btn-block" to="/signup">
                  {t.login_create} <ArrowUpRight size={16} />
                </Link>
                <button type="button" className="auth-secondary" onClick={resetToPhone}>
                  {t.login_try_another}
                </button>
              </div>
            </motion.div>
          ) : step === 'phone' ? (
            <motion.form key="phone" onSubmit={submitPhone} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.32, ease }}>
              <h1>{t.login_h1}</h1>
              <p className="auth-welcome">{t.login_welcome}</p>
              <p className="auth-lead">{t.login_lead}</p>
              <PhoneInput
                value={phone}
                onChange={(v) => { setPhone(v); setError(''); }}
                autoFocus
                error={
                  phone.length === 10 && !isIndianMobile(phone)
                    ? t.val_mobile
                    : (error && !isIndianMobile(phone) ? error : '')
                }
              />
              <button className="auth-btn auth-btn-block" type="submit" disabled={loading || phone.length !== 10}>
                {loading ? <><Loader2 size={18} className="animate-spin" /> {t.login_sending}</> : <>{t.login_send} <ArrowUpRight size={16} /></>}
              </button>
              {error && isIndianMobile(phone) ? <p className="auth-banner error" role="alert">{error}</p> : null}
              <p className="auth-switch">
                {t.login_no_account} <Link to="/signup">{t.login_create_long}</Link>
              </p>
            </motion.form>
          ) : (
            <motion.form
              key="otp"
              onSubmit={(e) => { e.preventDefault(); submitOtp(); }}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.32, ease }}
            >
              <h1>{t.otp_h1}</h1>
              <p className="auth-lead">{typeof t.otp_lead === 'function' ? t.otp_lead(maskPhone(phone)) : t.otp_lead}</p>
              <OTPInput
                value={otp}
                error={otpError}
                disabled={loading}
                onChange={(code) => {
                  setOtp(code);
                  setOtpError(false);
                  setError('');
                  if (code.length === 6) submitOtp(code);
                }}
              />
              <button className="auth-btn auth-btn-block" type="submit" disabled={loading || otp.length !== 6}>
                {loading ? <><Loader2 size={18} className="animate-spin" /> {t.otp_verifying}</> : <>{t.otp_verify} <ArrowUpRight size={16} /></>}
              </button>
              {error ? <p className="auth-banner error" role="alert">{error}</p> : null}
              <p className="auth-hint" style={{ marginTop: '1rem' }}>{t.otp_didnt}</p>
              <div className="auth-actions">
                <button type="button" className="auth-secondary" onClick={handleResend} disabled={resendTimer > 0 || loading}>
                  {resendTimer > 0 ? (typeof t.otp_resend_in === 'function' ? t.otp_resend_in(resendTimer) : t.otp_resend) : t.otp_resend}
                </button>
                <button type="button" className="auth-secondary" onClick={resetToPhone}>
                  {t.otp_change}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </AuthLayout>
  );
}
