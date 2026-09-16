import { API_URL } from './api';

export function normalizeMobile(phone) {
  if (phone == null) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(-10);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.length > 10) digits = digits.slice(-10);
  return digits.slice(0, 10);
}

export function isIndianMobile(phone) {
  return /^[6-9]\d{9}$/.test(normalizeMobile(phone));
}

const AUTH_MESSAGES = {
  ACCOUNT_NOT_FOUND: "This mobile number isn't registered with BharatGrow.",
  ACCOUNT_ALREADY_EXISTS: 'This mobile number is already linked to a BharatGrow account.',
  INVALID_MOBILE: 'Please enter a valid 10-digit mobile number.',
  OTP_SEND_FAILED: "We couldn't send the OTP right now. Please try again in a moment.",
  OTP_INVALID: 'The OTP is incorrect. Please check the message and try again.',
  OTP_EXPIRED: 'This OTP has expired. Please request a new one.',
  OTP_RATE_LIMITED: 'Too many OTP requests. Please wait a few minutes.',
  NETWORK_ERROR: 'Connection issue. Please check your internet and try again.',
};

export function persistSession(payload) {
  const prev = readSession() || {};
  const nextFarmer = payload?.farmer && typeof payload.farmer === 'object'
    ? payload.farmer
    : (payload && typeof payload === 'object' ? payload : {});
  const token = payload?.token || nextFarmer.token || prev.token || null;
  const farmer = {
    ...prev,
    ...nextFarmer,
    token,
    loggedInAt: payload?.token ? new Date().toISOString() : (prev.loggedInAt || new Date().toISOString()),
  };
  localStorage.setItem('soilai_farmer', JSON.stringify(farmer));
  return farmer;
}

export function readSession() {
  try {
    return JSON.parse(localStorage.getItem('soilai_farmer') || 'null');
  } catch {
    return null;
  }
}

export function hasLiveSession(farmer = readSession()) {
  return Boolean(farmer?.phone && farmer?.token);
}

export function clearSession() {
  localStorage.removeItem('soilai_farmer');
}

export function authMessage(data, fallback, network = false) {
  if (network) return AUTH_MESSAGES.NETWORK_ERROR;
  if (data?.code && AUTH_MESSAGES[data.code]) {
    return data.message || AUTH_MESSAGES[data.code];
  }
  if (data?.message) return data.message;
  return fallback || AUTH_MESSAGES.OTP_SEND_FAILED;
}

const AUTH_I18N_KEYS = {
  ACCOUNT_NOT_FOUND: 'err_account_not_found',
  ACCOUNT_ALREADY_EXISTS: 'err_account_exists',
  INVALID_MOBILE: 'err_invalid_mobile',
  OTP_SEND_FAILED: 'err_otp_send',
  OTP_INVALID: 'err_otp_invalid',
  OTP_EXPIRED: 'err_otp_expired',
  OTP_RATE_LIMITED: 'err_otp_rate',
  NETWORK_ERROR: 'err_network',
};

export function authI18nKey(data, network = false) {
  if (network) return AUTH_I18N_KEYS.NETWORK_ERROR;
  if (data?.code && AUTH_I18N_KEYS[data.code]) return AUTH_I18N_KEYS[data.code];
  return 'err_generic';
}

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function sendOtp(phone, purpose = 'login') {
  const res = await fetch(`${API_URL}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: normalizeMobile(phone), mobile: normalizeMobile(phone), purpose }),
  });
  return parse(res);
}

export async function resendOtp(phone, purpose = 'login') {
  const res = await fetch(`${API_URL}/api/auth/resend-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: normalizeMobile(phone), mobile: normalizeMobile(phone), purpose }),
  });
  return parse(res);
}

export async function verifyOtp({ phone, otp, name, village, purpose = 'login' }) {
  const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: normalizeMobile(phone),
      mobile: normalizeMobile(phone),
      otp,
      name,
      village,
      purpose,
    }),
  });
  return parse(res);
}

export async function registerProfile(profile) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...profile, phone: normalizeMobile(profile.phone) }),
  });
  return parse(res);
}

export async function fetchMe(token) {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parse(res);
}
