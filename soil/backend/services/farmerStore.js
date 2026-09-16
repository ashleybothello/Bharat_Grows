const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const otpService = require('./otp/otpService');

const pendingByPhone = new Map();
const memoryFarmers = new Map();
const sessions = new Map();

const PENDING_MS = 30 * 60 * 1000;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const DATA_DIR = path.join(__dirname, '..', '.data');
const SECRET_FILE = path.join(DATA_DIR, 'session-secret');
const SESSION_FILE = path.join(DATA_DIR, 'farmer-sessions.json');
const TOKEN_PREFIX = 'bg1';

function toB64url(text) {
  return Buffer.from(String(text), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64url(text) {
  const padded = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return Buffer.from(pad, 'base64').toString('utf8');
}

function hydrateSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    Object.entries(raw || {}).forEach(([token, rec]) => {
      if (rec?.phone && Number(rec.expiresAt) > Date.now()) {
        sessions.set(token, { phone: rec.phone, expiresAt: Number(rec.expiresAt) });
      }
    });
  } catch {
    // First boot, or the file is unreadable.
  }
}

function flushSessions() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {};
    sessions.forEach((rec, token) => {
      if (rec.expiresAt > Date.now()) obj[token] = rec;
    });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(obj));
  } catch {
    // Process-local fallback; sessions will not survive a restart.
  }
}

hydrateSessions();

function hashesMatch(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function loadOrCreateSecret() {
  const fromEnv = String(process.env.SESSION_SECRET || process.env.JWT_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const stored = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (stored) return stored;
  } catch {
    // First boot, or the file is unreadable — mint one below.
  }
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  } catch {
    // Process-local fallback; sessions will not survive a restart.
  }
  return generated;
}

let sessionSecret;
function getSessionSecret() {
  if (!sessionSecret) sessionSecret = loadOrCreateSecret();
  return sessionSecret;
}

function signPayload(payloadB64) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payloadB64).digest('hex');
}

function clip(value, max) {
  if (value == null) return '';
  return String(value).trim().slice(0, max);
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => clip(item, 80)).filter(Boolean).slice(0, 12);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => clip(item, 80)).filter(Boolean).slice(0, 12);
  }
  return [];
}

function sanitizeProfile(raw = {}) {
  const phone = otpService.normalizePhone(raw.phone);
  const farmSize = raw.farmSize === '' || raw.farmSize == null ? '' : Number(raw.farmSize);
  const age = raw.age === '' || raw.age == null ? '' : Number(raw.age);
  return {
    fullName: clip(raw.fullName, 100),
    phone,
    age: Number.isFinite(age) ? age : '',
    gender: clip(raw.gender, 40),
    preferredLanguage: clip(raw.preferredLanguage, 12) || 'en',
    state: clip(raw.state, 80),
    district: clip(raw.district, 80),
    taluka: clip(raw.taluka, 80),
    village: clip(raw.village, 150),
    pincode: clip(raw.pincode, 6),
    farmName: clip(raw.farmName, 120),
    latitude: raw.latitude === '' || raw.latitude == null ? null : Number(raw.latitude),
    longitude: raw.longitude === '' || raw.longitude == null ? null : Number(raw.longitude),
    farmSize: Number.isFinite(farmSize) ? farmSize : '',
    farmSizeUnit: clip(raw.farmSizeUnit, 20) || 'Acres',
    ownership: clip(raw.ownership, 40),
    soilType: clip(raw.soilType, 40),
    irrigationSource: clip(raw.irrigationSource, 40),
    waterAvailability: clip(raw.waterAvailability, 40),
    primaryCrop: clip(raw.primaryCrop, 80),
    secondaryCrops: toArray(raw.secondaryCrops),
    farmingType: clip(raw.farmingType, 40),
    experience: clip(raw.experience, 40),
    currentSeason: clip(raw.currentSeason, 40),
    cropStage: clip(raw.cropStage, 40),
    usesSmartFarming: clip(raw.usesSmartFarming, 20),
    technologiesUsed: toArray(raw.technologiesUsed),
    governmentSchemes: clip(raw.governmentSchemes, 8),
    interests: toArray(raw.interests),
    preferredCommunication: toArray(raw.preferredCommunication),
    email: clip(String(raw.email || '').trim().toLowerCase(), 160),
  };
}

function validateProfile(profile) {
  if (!profile.fullName || profile.fullName.length < 2) {
    return 'Please enter your full name.';
  }
  if (!otpService.isValidIndianPhone(profile.phone)) {
    return 'Please enter a valid 10-digit mobile number.';
  }
  if (profile.age !== '' && (profile.age < 15 || profile.age > 100)) {
    return 'Please enter a sensible age.';
  }
  if (!profile.preferredLanguage) return 'Please choose a preferred language.';
  if (!profile.state) return 'Please select your state.';
  if (!profile.district) return 'Please select your district.';
  if (!profile.taluka) return 'Please enter your taluka / tehsil.';
  if (!profile.village) return 'Please enter your village.';
  if (!/^\d{6}$/.test(profile.pincode)) return 'Please enter a valid 6-digit pincode.';
  if (!(Number(profile.farmSize) > 0)) return 'Please enter a farm size greater than zero.';
  if (!profile.primaryCrop) return 'Please enter your primary crop.';
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    return 'Please enter a valid email address, or leave it blank.';
  }
  return null;
}

function publicFarmer(row) {
  if (!row) return null;
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : {};
  return {
    id: row.id,
    phone: row.phone,
    name: row.name || profile.fullName || '',
    village: row.village || profile.village || '',
    phoneVerified: Boolean(row.phone_verified ?? row.phoneVerified),
    profile,
  };
}

function rememberPending(phone, profile, purpose = 'signup') {
  const normalized = otpService.normalizePhone(phone);
  pendingByPhone.set(normalized, {
    profile,
    purpose: purpose === 'login' ? 'login' : 'signup',
    createdAt: Date.now(),
  });
}

function peekPendingRecord(phone) {
  const normalized = otpService.normalizePhone(phone);
  const record = pendingByPhone.get(normalized);
  if (!record) return null;
  if (Date.now() - record.createdAt > PENDING_MS) {
    pendingByPhone.delete(normalized);
    return null;
  }
  return record;
}

function takePendingRecord(phone) {
  const normalized = otpService.normalizePhone(phone);
  const record = peekPendingRecord(normalized);
  if (!record) return null;
  pendingByPhone.delete(normalized);
  return record;
}

function takePending(phone) {
  return takePendingRecord(phone)?.profile || null;
}

function peekPending(phone) {
  return peekPendingRecord(phone)?.profile || null;
}

function livePhone(token) {
  const record = sessions.get(token);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return record.phone;
}

function createSession(phone) {
  const normalized = otpService.normalizePhone(phone);
  const expiresAt = Date.now() + SESSION_MS;
  const payloadB64 = toB64url(JSON.stringify({ p: normalized, e: expiresAt }));
  const token = `${TOKEN_PREFIX}.${payloadB64}.${signPayload(payloadB64)}`;
  sessions.set(token, { phone: normalized, expiresAt });
  flushSessions();
  return token;
}

function phoneFromSignedToken(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, payloadB64, sig] = parts;
  if (!payloadB64 || !sig || !hashesMatch(sig, signPayload(payloadB64))) return null;
  try {
    const parsed = JSON.parse(fromB64url(payloadB64));
    const phone = otpService.normalizePhone(parsed?.p);
    const expiresAt = Number(parsed?.e);
    if (!phone || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
    sessions.set(token, { phone, expiresAt });
    return phone;
  } catch {
    return null;
  }
}

function phoneFromToken(token) {
  if (!token) return null;
  const cached = livePhone(token);
  if (cached) return cached;
  const signed = phoneFromSignedToken(token);
  if (signed) return signed;
  hydrateSessions();
  return livePhone(token);
}

async function upsertFarmer(phone, extras = {}) {
  phone = otpService.normalizePhone(phone);
  const pending = extras.profile || peekPending(phone);
  const name = extras.name || pending?.fullName || null;
  const village = extras.village || pending?.village || null;
  const profile = pending || extras.profile || {};

  if (!process.env.DATABASE_URL) {
    const current = memoryFarmers.get(phone) || { id: phone, phone };
    const next = {
      ...current,
      phone,
      name: name || current.name || null,
      village: village || current.village || null,
      phone_verified: true,
      profile: Object.keys(profile).length ? { ...(current.profile || {}), ...profile } : (current.profile || {}),
      last_login: new Date().toISOString(),
    };
    memoryFarmers.set(phone, next);
    return next;
  }

  try {
    const existing = await pool.query('SELECT * FROM farmers WHERE phone = $1', [phone]);
    if (existing.rows.length) {
      const updated = await pool.query(
        `UPDATE farmers
         SET last_login = NOW(),
             name = COALESCE($2, name),
             village = COALESCE($3, village),
             phone_verified = TRUE,
             profile = CASE
               WHEN $4::jsonb = '{}'::jsonb THEN COALESCE(profile, '{}'::jsonb)
               ELSE COALESCE(profile, '{}'::jsonb) || $4::jsonb
             END,
             updated_at = NOW()
         WHERE phone = $1
         RETURNING *`,
        [phone, name, village, JSON.stringify(profile || {})]
      );
      return updated.rows[0];
    }
    const inserted = await pool.query(
      `INSERT INTO farmers (phone, name, village, phone_verified, profile)
       VALUES ($1, $2, $3, TRUE, $4::jsonb)
       RETURNING *`,
      [phone, name, village, JSON.stringify(profile || {})]
    );
    return inserted.rows[0];
  } catch {
    return {
      id: phone,
      phone,
      name,
      village,
      phone_verified: true,
      profile,
    };
  }
}

async function findByPhone(phone) {
  const normalized = otpService.normalizePhone(phone);
  if (!normalized) return null;
  if (!process.env.DATABASE_URL) {
    return memoryFarmers.get(normalized) || null;
  }
  try {
    const result = await pool.query('SELECT * FROM farmers WHERE phone = $1 LIMIT 1', [normalized]);
    return result.rows[0] || null;
  } catch {
    return memoryFarmers.get(normalized) || null;
  }
}

async function mergeProfile(phone, patch = {}) {
  return upsertFarmer(phone, { profile: patch });
}

async function existsByPhone(phone) {
  return Boolean(await findByPhone(phone));
}

async function markLogin(phone) {
  const farmer = await findByPhone(phone);
  if (!farmer) return null;
  if (!process.env.DATABASE_URL) {
    farmer.last_login = new Date().toISOString();
    memoryFarmers.set(farmer.phone, farmer);
    return farmer;
  }
  try {
    const updated = await pool.query(
      `UPDATE farmers SET last_login = NOW(), phone_verified = TRUE, updated_at = NOW()
       WHERE phone = $1 RETURNING *`,
      [farmer.phone],
    );
    return updated.rows[0] || farmer;
  } catch {
    return farmer;
  }
}

async function createFarmer(phone, extras = {}) {
  const normalized = otpService.normalizePhone(phone);
  const existing = await findByPhone(normalized);
  if (existing) {
    const err = new Error('An account already exists with this mobile number.');
    err.appStatus = 409;
    err.code = 'ACCOUNT_ALREADY_EXISTS';
    throw err;
  }

  const pending = extras.profile || peekPending(normalized);
  const name = extras.name || pending?.fullName || null;
  const village = extras.village || pending?.village || null;
  const profile = pending || extras.profile || {};
  phone = normalized;

  if (!process.env.DATABASE_URL) {
    const next = {
      id: phone,
      phone,
      name,
      village,
      phone_verified: true,
      profile,
      last_login: new Date().toISOString(),
    };
    memoryFarmers.set(phone, next);
    return next;
  }

  try {
    const inserted = await pool.query(
      `INSERT INTO farmers (phone, name, village, phone_verified, profile)
       VALUES ($1, $2, $3, TRUE, $4::jsonb)
       RETURNING *`,
      [phone, name, village, JSON.stringify(profile || {})],
    );
    return inserted.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      const dup = new Error('An account already exists with this mobile number.');
      dup.appStatus = 409;
      dup.code = 'ACCOUNT_ALREADY_EXISTS';
      throw dup;
    }
    throw err;
  }
}

function hasCompleteProfile(farmer) {
  const profile = farmer?.profile || {};
  return Boolean((farmer?.name || profile.fullName) && (profile.primaryCrop || farmer?.village));
}

module.exports = {
  sanitizeProfile,
  validateProfile,
  publicFarmer,
  rememberPending,
  takePending,
  takePendingRecord,
  peekPending,
  peekPendingRecord,
  createSession,
  phoneFromToken,
  upsertFarmer,
  createFarmer,
  markLogin,
  existsByPhone,
  findByPhone,
  mergeProfile,
  hasCompleteProfile,
};
