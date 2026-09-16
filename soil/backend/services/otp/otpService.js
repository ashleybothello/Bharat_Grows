const crypto = require('crypto');
const mockOtpProvider = require('./mockOtpProvider');
const fast2smsOtpProvider = require('./fast2smsOtpProvider');

const otpStore = new Map();
const sendLog = new Map();
let providerSendCount = 0;

function providerName() {
  return String(process.env.OTP_PROVIDER || 'fast2sms').trim().toLowerCase();
}

function isMock() {
  return providerName() === 'mock';
}

function expiryMs() {
  return Number(process.env.OTP_EXPIRY_SECONDS || 300) * 1000;
}

function cooldownMs() {
  return Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000;
}

function maxAttempts() {
  return Number(process.env.OTP_MAX_ATTEMPTS || 5);
}

function maxSends() {
  return Number(process.env.OTP_MAX_SENDS_PER_WINDOW || 5);
}

function sendWindowMs() {
  return Number(process.env.OTP_SEND_WINDOW_SECONDS || 600) * 1000;
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(phone, otp) {
  const secret = process.env.OTP_HASH_SECRET || 'krishimitra-hackathon-otp';
  return crypto.createHmac('sha256', secret).update(`${phone}:${otp}`).digest('hex');
}

function hashesMatch(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function normalizePhone(phone) {
  if (phone == null) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(-10);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}

function isValidIndianPhone(phone) {
  return /^[6-9]\d{9}$/.test(phone);
}

function maskPhone(phone) {
  return `******${String(phone).slice(-4)}`;
}

function pruneSendLog(phone) {
  const now = Date.now();
  const stamps = (sendLog.get(phone) || []).filter((ts) => now - ts < sendWindowMs());
  sendLog.set(phone, stamps);
  return stamps;
}

function assertNotRateLimited(phone, { isResend }) {
  const stamps = pruneSendLog(phone);
  if (stamps.length >= maxSends()) {
    const err = new Error('Too many OTP requests. Please wait a few minutes.');
    err.appStatus = 429;
    err.code = 'OTP_RATE_LIMITED';
    throw err;
  }
  const last = stamps[stamps.length - 1];
  if (last && Date.now() - last < cooldownMs()) {
    const wait = Math.ceil((cooldownMs() - (Date.now() - last)) / 1000);
    const err = new Error(`Please wait ${wait}s before requesting another OTP.`);
    err.appStatus = 429;
    err.code = 'OTP_RATE_LIMITED';
    throw err;
  }
  if (isResend && stamps.length === 0) return;
}

function rememberSend(phone) {
  const stamps = pruneSendLog(phone);
  stamps.push(Date.now());
  sendLog.set(phone, stamps);
}

function getProvider() {
  return isMock() ? mockOtpProvider : fast2smsOtpProvider;
}

async function issueOtp(phone, { isResend = false, purpose = 'login' } = {}) {
  phone = normalizePhone(phone);
  const intent = purpose === 'signup' ? 'signup' : 'login';
  assertNotRateLimited(phone, { isResend });
  const otp = generateOtp();
  providerSendCount += 1;
  await getProvider().send({ phone, otp });

  otpStore.set(phone, {
    otpHash: hashOtp(phone, otp),
    expiresAt: Date.now() + expiryMs(),
    attempts: 0,
    lastSentAt: Date.now(),
    purpose: intent,
  });
  rememberSend(phone);

  console.log(`[OTP] SMS accepted for ${maskPhone(phone)} via ${providerName()} (${intent}).`);

  return {
    success: true,
    message: 'OTP sent successfully',
    expiresIn: Math.round(expiryMs() / 1000),
    purpose: intent,
  };
}

function verifyStoredOtp(phone, otp, expectedPurpose) {
  phone = normalizePhone(phone);
  const record = otpStore.get(phone);
  if (!record) {
    const err = new Error('Invalid OTP');
    err.appStatus = 400;
    err.code = 'OTP_INVALID';
    throw err;
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    const err = new Error('OTP expired');
    err.appStatus = 400;
    err.code = 'OTP_EXPIRED';
    throw err;
  }
  const intent = expectedPurpose === 'signup' ? 'signup' : 'login';
  if ((record.purpose || 'login') !== intent) {
    const err = new Error('Invalid OTP');
    err.appStatus = 400;
    err.code = 'OTP_INVALID';
    throw err;
  }
  if (record.attempts >= maxAttempts()) {
    otpStore.delete(phone);
    const err = new Error('Too many incorrect attempts. Request a new OTP.');
    err.appStatus = 429;
    err.code = 'OTP_RATE_LIMITED';
    throw err;
  }
  if (!hashesMatch(record.otpHash, hashOtp(phone, otp))) {
    record.attempts += 1;
    if (record.attempts >= maxAttempts()) {
      otpStore.delete(phone);
      const err = new Error('Too many incorrect attempts. Request a new OTP.');
      err.appStatus = 429;
      err.code = 'OTP_RATE_LIMITED';
      throw err;
    }
    const err = new Error('Invalid OTP');
    err.appStatus = 400;
    err.code = 'OTP_INVALID';
    throw err;
  }
  otpStore.delete(phone);
  return { purpose: record.purpose || intent };
}

function clearOtp(phone) {
  otpStore.delete(normalizePhone(phone));
}

function expireStoredOtp(phone) {
  const record = otpStore.get(normalizePhone(phone));
  if (!record) return false;
  record.expiresAt = 0;
  return true;
}

function getProviderSendCount() {
  return providerSendCount;
}

function resetProviderSendCount() {
  providerSendCount = 0;
}

function cooldownSeconds() {
  return Math.round(cooldownMs() / 1000);
}

module.exports = {
  normalizePhone,
  isValidIndianPhone,
  issueOtp,
  verifyStoredOtp,
  clearOtp,
  expireStoredOtp,
  getProviderSendCount,
  resetProviderSendCount,
  cooldownSeconds,
  isMock,
};
