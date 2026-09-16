/**
 * Pest / leaf-disease scan — Kindwise plant.id
 * Insect scan — Kindwise insect.id
 *
 * API keys stay on the server. Images are not persisted.
 * The browser uploads multipart/form-data; Express forwards bytes as JSON + base64.
 */

const express = require('express');
const multer = require('multer');
const axios = require('axios');

const router = express.Router();

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const ALLOWED_EXT = /\.(jpe?g|png)$/i;
const DEFAULT_PLANT_URL = 'https://api.plant.id/v3/identification';
const DEFAULT_INSECT_URL = 'https://insect.kindwise.com/api/v1/identification';
const PLANT_DETAILS = 'common_names,url,description,treatment,classification,cause';
const INSECT_DETAILS = 'common_names,url,description,taxonomy';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '');
    if (ALLOWED_MIME.has(mime) || ALLOWED_EXT.test(name)) {
      cb(null, true);
      return;
    }
    const err = new Error('INVALID_FILE');
    err.code = 'INVALID_FILE';
    cb(err);
  },
});

function fail(res, status, code, error) {
  return res.status(status).json({ success: false, code, error });
}

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function plantUrl() {
  return env('PLANT_ID_API_URL')
    || env('PLANT_HEALTH_API_URL')
    || DEFAULT_PLANT_URL;
}

function insectUrl() {
  return env('INSECT_ID_API_URL') || DEFAULT_INSECT_URL;
}

function plantKey() {
  return env('PLANT_ID_API_KEY') || env('PLANT_HEALTH_API_KEY');
}

function insectKey() {
  return env('INSECT_ID_API_KEY');
}

function isJpegOrPng(buffer) {
  if (!buffer || buffer.length < 8) return false;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  return jpeg || png;
}

function asPercent(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 1) return Math.round(n * 1000) / 10;
  if (n > 1 && n <= 100) return Math.round(n * 10) / 10;
  return null;
}

function textOf(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => textOf(item)).filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }
  if (typeof value === 'object') {
    return textOf(
      value.value
      || value.description
      || value.text
      || value.name
      || value.biological
      || value.chemical
      || value.prevention,
    );
  }
  return null;
}

function treatmentOf(details) {
  const raw = details?.treatment;
  if (!raw || typeof raw !== 'object') {
    const biological = textOf(details?.biological_treatment || details?.organic_treatment);
    const chemical = textOf(details?.chemical_treatment);
    const prevention = textOf(details?.prevention);
    if (!biological && !chemical && !prevention) return null;
    return { biological, chemical, prevention };
  }
  const biological = textOf(raw.biological || raw.organic);
  const chemical = textOf(raw.chemical);
  const prevention = textOf(raw.prevention);
  if (!biological && !chemical && !prevention) return null;
  return { biological, chemical, prevention };
}

function taxonomyOf(details) {
  const tax = details?.taxonomy;
  if (!tax) return null;
  if (typeof tax === 'string') return tax;
  if (typeof tax === 'object') {
    return textOf(tax.family || tax.order || tax.genus || tax.class) || null;
  }
  return null;
}

function categoryOf(details, row) {
  return textOf(
    details?.type
    || details?.classification
    || taxonomyOf(details)
    || row?.classification
    || row?.type,
  );
}

function shapeSuggestion(row) {
  if (!row || typeof row !== 'object') return null;
  const name = textOf(row.name || row.scientific_name);
  if (!name) return null;
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  const common = Array.isArray(details.common_names)
    ? details.common_names.map((n) => textOf(n)).filter(Boolean)
    : [];
  const probability = Number.isFinite(Number(row.probability)) ? Number(row.probability) : null;
  return {
    name,
    scientific_name: textOf(row.scientific_name) || null,
    common_names: common.length ? common : null,
    probability,
    confidence_pct: asPercent(probability),
    category: categoryOf(details, row) || null,
    description: textOf(details.description || details.wiki_description || details.description_all || row.description) || null,
    symptoms: textOf(details.symptoms || details.cause) || null,
    severity: textOf(details.severity || details.danger) || null,
    treatment: treatmentOf(details),
  };
}

function isHealthyName(name) {
  return /\bhealthy\b/i.test(String(name || ''));
}

function suggestionRows(result) {
  return result?.crop?.suggestions
    || result?.plant?.suggestions
    || result?.classification?.suggestions
    || [];
}

function normalizePlantId(payload) {
  const result = payload?.result || {};
  const cropRows = suggestionRows(result);
  const diseaseRows = result.disease?.suggestions || [];
  const crop = shapeSuggestion(cropRows[0]);
  const disease = shapeSuggestion(diseaseRows[0]);
  const alternatives = diseaseRows.slice(1, 4).map(shapeSuggestion).filter(Boolean);
  const isPlantBinary = result.is_plant?.binary;
  const isHealthyBinary = result.is_healthy?.binary;
  const healthyFromName = disease ? isHealthyName(disease.name) : false;
  const modelVersion = textOf(payload?.model_version || payload?.version);
  const sla = payload?.sla_compliant_model;

  return {
    success: true,
    source: 'kindwise_plant_id',
    kind: 'leaf',
    is_plant: typeof isPlantBinary === 'boolean' ? isPlantBinary : null,
    is_healthy: typeof isHealthyBinary === 'boolean' ? isHealthyBinary : (disease ? healthyFromName : null),
    crop,
    disease,
    alternatives: alternatives.length ? alternatives : null,
    model: {
      version: modelVersion,
      sla: typeof sla === 'boolean' ? sla : null,
      product: 'Kindwise plant.id',
    },
  };
}

function normalizeInsectId(payload) {
  const result = payload?.result || {};
  const rows = suggestionRows(result);
  const insect = shapeSuggestion(rows[0]);
  const alternatives = rows.slice(1, 4).map(shapeSuggestion).filter(Boolean);
  const isInsectBinary = result.is_insect?.binary;
  const modelVersion = textOf(payload?.model_version || payload?.version);
  const sla = payload?.sla_compliant_model;

  return {
    success: true,
    source: 'kindwise_insect_id',
    kind: 'insect',
    is_insect: typeof isInsectBinary === 'boolean' ? isInsectBinary : null,
    insect,
    alternatives: alternatives.length ? alternatives : null,
    model: {
      version: modelVersion,
      sla: typeof sla === 'boolean' ? sla : null,
      product: 'Kindwise insect.id',
    },
  };
}

function mapKindwiseStatus(err, product) {
  const status = err.response?.status;
  const label = product === 'insect' ? 'Insect identification' : 'Plant health';
  if (status === 401 || status === 403) {
    return { status: 502, code: 'PEST_API_KEY', error: `${label} API key was rejected.` };
  }
  if (status === 429 || status === 402) {
    return { status: 429, code: 'PEST_API_QUOTA', error: `${label} API quota is exhausted.` };
  }
  if (status === 400 || status === 422) {
    return {
      status: 422,
      code: product === 'insect' ? 'INSECT_NOT_DETECTED' : 'PEST_IMAGE_UNRECOGNIZED',
      error: product === 'insect'
        ? 'Unable to analyze this image. Please upload a clear photo of the insect.'
        : 'Unable to analyze this image. Please upload a clear photo of a crop leaf.',
    };
  }
  const timedOut = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ERR_CANCELED';
  if (!err.response || timedOut) {
    return {
      status: 503,
      code: timedOut ? 'PEST_API_TIMEOUT' : 'PEST_API_UNAVAILABLE',
      error: timedOut
        ? `${label} API did not respond in time.`
        : `${label} API is unavailable.`,
    };
  }
  return { status: 502, code: 'PEST_API_FAILED', error: `Could not complete the ${label.toLowerCase()} scan.` };
}

function kindOf(req) {
  const raw = String(req.body?.kind || req.query?.kind || 'leaf').trim().toLowerCase();
  return raw === 'insect' ? 'insect' : 'leaf';
}

async function identifyKindwise({ url, apiKey, images, details, extraBody = {} }) {
  const { data } = await axios.post(
    url,
    { images, ...extraBody },
    {
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      params: { details },
      timeout: Number(process.env.PLANT_HEALTH_TIMEOUT_MS || 45000),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    },
  );
  return data;
}

function handleUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE' || err.message === 'File too large') {
        return fail(res, 400, 'FILE_TOO_LARGE', 'Image must be 10MB or smaller.');
      }
      return fail(res, 400, 'INVALID_FILE', 'Please upload a JPG or PNG photo.');
    }
    if (!req.file?.buffer?.length) {
      return fail(res, 400, 'NO_IMAGE', 'No image selected.');
    }
    if (!isJpegOrPng(req.file.buffer)) {
      return fail(res, 400, 'INVALID_FILE', 'Please upload a JPG or PNG photo.');
    }
    return next();
  });
}

async function detectLeaf(req, res) {
  const apiKey = plantKey();
  if (!apiKey) {
    return fail(res, 503, 'PEST_API_UNCONFIGURED', 'Plant health API is not configured.');
  }
  try {
    const data = await identifyKindwise({
      url: plantUrl(),
      apiKey,
      images: [req.file.buffer.toString('base64')],
      details: PLANT_DETAILS,
      extraBody: { health: 'all' },
    });
    const normalized = normalizePlantId(data);
    if (normalized.is_plant === false) {
      return fail(res, 422, 'PLANT_NOT_DETECTED', 'Unable to analyze this image. Please upload a clear photo of a crop leaf.');
    }
    if (!normalized.crop && !normalized.disease) {
      return fail(res, 422, 'PEST_IMAGE_UNRECOGNIZED', 'Unable to analyze this image. Please upload a clear photo of a crop leaf.');
    }
    return res.json(normalized);
  } catch (error) {
    const mapped = mapKindwiseStatus(error, 'plant');
    console.error('[pest/detect]', mapped.code, error.response?.status || error.code || error.message);
    return fail(res, mapped.status, mapped.code, mapped.error);
  }
}

async function detectInsect(req, res) {
  const apiKey = insectKey();
  if (!apiKey) {
    return fail(res, 503, 'PEST_API_UNCONFIGURED', 'Insect identification API is not configured.');
  }
  try {
    const data = await identifyKindwise({
      url: insectUrl(),
      apiKey,
      images: [req.file.buffer.toString('base64')],
      details: INSECT_DETAILS,
    });
    const normalized = normalizeInsectId(data);
    if (normalized.is_insect === false) {
      return fail(res, 422, 'INSECT_NOT_DETECTED', 'Unable to analyze this image. Please upload a clear photo of the insect.');
    }
    if (!normalized.insect) {
      return fail(res, 422, 'INSECT_NOT_DETECTED', 'Unable to analyze this image. Please upload a clear photo of the insect.');
    }
    return res.json(normalized);
  } catch (error) {
    const mapped = mapKindwiseStatus(error, 'insect');
    console.error('[pest/insect]', mapped.code, error.response?.status || error.code || error.message);
    return fail(res, mapped.status, mapped.code, mapped.error);
  }
}

router.post('/detect', handleUpload, (req, res) => {
  if (kindOf(req) === 'insect') return detectInsect(req, res);
  return detectLeaf(req, res);
});

router.post('/insect', handleUpload, detectInsect);

module.exports = { router };
