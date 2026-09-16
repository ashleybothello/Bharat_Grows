/**
 * ML routes — the only bridge between BharatGrow and the Python ML service.
 *
 * React -> Express :5005 (/api/ml/*) -> FastAPI :8000 -> crop model / rainfall engine
 *
 * The frontend never talks to FastAPI and never sees model artifacts. The ML
 * service URL, market API key and database credentials all stay in this process.
 *
 * Failure policy: if the ML service is unreachable, times out, or rejects the
 * input, these routes surface a real error. They never substitute placeholder
 * predictions, rainfall values or confidence scores.
 */

const express = require('express');
const axios = require('axios');

const marketService = require('../services/market/marketService');
const { commodityCandidates } = require('../services/market/cropCommodityMap');

const router = express.Router();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
const ML_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS || 20000);

const mlClient = axios.create({
  baseURL: ML_SERVICE_URL,
  timeout: ML_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Translate an ML-service failure into an HTTP response the frontend can act on.
 * `code` is stable so the UI can pick the right message without parsing prose.
 */
function respondWithMlError(res, error, context) {
  const status = error.response?.status;
  const detail = error.response?.data?.detail;

  if (status) {
    console.error(`[ml] ${context} — FastAPI ${status}:`, detail || error.response.data);
    return res.status(status).json({
      success: false,
      code: status === 422 ? 'ML_INVALID_INPUT' : 'ML_SERVICE_ERROR',
      error: typeof detail === 'string' ? detail : 'The ML service rejected the request.',
      details: typeof detail === 'string' ? undefined : detail,
    });
  }

  const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
  console.error(`[ml] ${context} — ${error.code || 'unknown'}: ${error.message}`);
  return res.status(503).json({
    success: false,
    code: timedOut ? 'ML_SERVICE_TIMEOUT' : 'ML_SERVICE_UNAVAILABLE',
    error: timedOut
      ? `The ML service did not respond within ${ML_TIMEOUT_MS}ms.`
      : 'The ML service is not reachable. Start it on ' + ML_SERVICE_URL + ' and retry.',
  });
}

/**
 * Field observation shared by every ML route.
 *
 * Values come from the Analyze form today and from ESP32 telemetry once nodes
 * are paired — `device_id` (BG-NODE-XXX) is carried through untouched so the
 * same payload shape works for both. Nothing is defaulted or synthesised: a
 * missing required reading becomes a 400 here rather than a guess downstream.
 */
const REQUIRED_FIELDS = ['n', 'p', 'k', 'ph', 'temperature', 'humidity', 'soil_moisture'];

function buildFieldPayload(body) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const raw = {
    n: num(body.n ?? body.nitrogen ?? body.N),
    p: num(body.p ?? body.phosphorus ?? body.P),
    k: num(body.k ?? body.potassium ?? body.K),
    ph: num(body.ph),
    temperature: num(body.temperature),
    humidity: num(body.humidity),
    soil_moisture: num(body.soil_moisture ?? body.moisture),
  };

  const missing = REQUIRED_FIELDS.filter((field) => raw[field] === null);
  if (missing.length) {
    return { error: `Missing or non-numeric required field(s): ${missing.join(', ')}` };
  }

  // rainfall is optional: when absent the ML service uses the live Open-Meteo
  // forecast total instead, and says so in rainfall_feature.source.
  const rainfall = num(body.rainfall);

  return {
    payload: {
      N: raw.n,
      P: raw.p,
      K: raw.k,
      ph: raw.ph,
      temperature: raw.temperature,
      humidity: raw.humidity,
      soil_moisture: raw.soil_moisture,
      ...(rainfall === null ? {} : { rainfall }),
      ...(num(body.latitude) === null ? {} : { latitude: num(body.latitude) }),
      ...(num(body.longitude) === null ? {} : { longitude: num(body.longitude) }),
      ...(body.state ? { state: String(body.state) } : {}),
      ...(body.device_id ? { device_id: String(body.device_id) } : {}),
      top_k: Math.min(Math.max(Number(body.top_k) || 3, 1), 10),
    },
  };
}

router.get('/health', async (_req, res) => {
  try {
    const { data } = await mlClient.get('/health');
    res.json({ success: true, ml_service: ML_SERVICE_URL, ...data });
  } catch (error) {
    respondWithMlError(res, error, 'health');
  }
});

/** Crop model only. Real predict_proba top-k, no rainfall intelligence. */
router.post('/crop-predict', async (req, res) => {
  const { payload, error } = buildFieldPayload({ ...req.body, soil_moisture: req.body.soil_moisture ?? req.body.moisture ?? 0 });
  if (error) return res.status(400).json({ success: false, code: 'INVALID_INPUT', error });

  if (payload.rainfall === undefined) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_INPUT',
      error: 'rainfall is required for /crop-predict. Use /farm-analysis to derive it from live weather instead.',
    });
  }

  try {
    const { data } = await mlClient.post('/predict/crop', {
      N: payload.N, P: payload.P, K: payload.K,
      temperature: payload.temperature, humidity: payload.humidity,
      ph: payload.ph, rainfall: payload.rainfall,
      top_k: payload.top_k,
      device_id: payload.device_id,
    });
    res.json({ success: true, ...data });
  } catch (err) {
    respondWithMlError(res, err, 'crop-predict');
  }
});

/** Rule-based rainfall intelligence. Named for what it is, not a forecast model. */
router.post('/rainfall-intelligence', async (req, res) => {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const latitude = num(req.body.latitude);
  const longitude = num(req.body.longitude);

  if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_INPUT',
      error: 'latitude and longitude are required numbers.',
    });
  }

  try {
    const { data } = await mlClient.post('/rainfall/intelligence', {
      latitude,
      longitude,
      state: req.body.state || null,
      soil_moisture: num(req.body.soil_moisture ?? req.body.moisture),
      device_id: req.body.device_id || null,
    });
    res.json({ success: true, ...data });
  } catch (err) {
    respondWithMlError(res, err, 'rainfall-intelligence');
  }
});

/** Crop model + rainfall intelligence, without market data or ranking. */
router.post('/farm-analysis', async (req, res) => {
  const { payload, error } = buildFieldPayload(req.body);
  if (error) return res.status(400).json({ success: false, code: 'INVALID_INPUT', error });

  try {
    const { data } = await mlClient.post('/analyze/farm', payload);
    res.json({ success: true, ...data });
  } catch (err) {
    respondWithMlError(res, err, 'farm-analysis');
  }
});

/**
 * Look up the latest real modal price for each candidate crop.
 *
 * Uses the existing Government OGD / AGMARKNET market service — no separate
 * market pipeline. A crop with no published price is simply absent from the
 * result, which the decision engine reports as unpriced rather than guessing.
 */
async function fetchModalPrices(crops, { state } = {}) {
  const prices = {};
  const unavailable = [];

  /** Latest published modal price for one commodity name, or null. */
  async function priceFor(commodity, scopeFilters) {
    const data = await marketService.getCommodity(commodity, scopeFilters);
    const modal = data?.metrics?.latest ?? data?.latest?.modal ?? null;
    const value = Number(modal);
    if (!Number.isFinite(value) || value <= 0) return null;
    return {
      modal_price: value,
      commodity,
      unit: data.unit || '₹/quintal',
      arrival_date: data.lastUpdated || null,
      source: data.source || 'Government OGD / AGMARKNET',
    };
  }

  const lookups = crops.map(async (crop) => {
    const candidates = commodityCandidates(crop);
    const attempted = [];

    // Prefer the farmer's own state, then fall back to the national snapshot.
    // The scope actually used is reported so nothing looks more local than it is.
    const scopes = state
      ? [{ label: `state: ${state}`, filters: { state } }, { label: 'national', filters: {} }]
      : [{ label: 'national', filters: {} }];

    for (const scope of scopes) {
      for (const commodity of candidates) {
        attempted.push(`${commodity} (${scope.label})`);
        try {
          const found = await priceFor(commodity, scope.filters);
          if (found) {
            prices[crop] = { ...found, scope: scope.label };
            return;
          }
        } catch (err) {
          // Try the next candidate; a single miss is not a failure.
          console.warn(`[ml] market lookup failed for ${commodity}: ${err.message}`);
        }
      }
    }

    unavailable.push({
      crop,
      reason: 'No published modal price found in the current OGD snapshot.',
      commodities_tried: attempted,
    });
  });

  await Promise.all(lookups);
  return { prices, unavailable };
}

/**
 * The full Analyze path: crop model + rainfall intelligence + real mandi prices
 * -> deterministic decision engine -> ranked recommendation.
 *
 * Persists the reading and prediction into the existing soil_data/predictions
 * tables so the History page keeps working unchanged.
 */
function createCropDecisionHandler(pool) {
  return async (req, res) => {
    const { payload, error } = buildFieldPayload(req.body);
    if (error) return res.status(400).json({ success: false, code: 'INVALID_INPUT', error });

    // Pass 1 — crop model + rainfall, to learn which crops are candidates.
    let analysis;
    try {
      const { data } = await mlClient.post('/analyze/farm', payload);
      analysis = data;
    } catch (err) {
      return respondWithMlError(res, err, 'crop-decision/analyze');
    }

    const candidates = (analysis.crop_prediction?.top_crops || []).map((c) => c.crop);

    // Pass 2 — real market prices for exactly those candidates.
    const { prices, unavailable } = await fetchModalPrices(candidates, { state: req.body.state });

    // Pass 3 — rank. Market prices are omitted entirely when none were found,
    // so the engine reports the component as unavailable instead of scoring zero.
    let decision;
    try {
      const { data } = await mlClient.post('/decide/crop', {
        ...payload,
        rainfall: analysis.rainfall_feature?.value_mm ?? payload.rainfall,
        market_prices: Object.keys(prices).length ? prices : null,
      });
      decision = data;
    } catch (err) {
      return respondWithMlError(res, err, 'crop-decision/decide');
    }

    // Ranked order comes from the decision engine; probabilities stay the model's own.
    const ranked = decision.decision?.ranked_crops || [];

    const response = {
      success: true,
      ...decision,
      market_inputs: {
        prices,
        unavailable,
        source: 'Government OGD / AGMARKNET',
      },
      // Legacy field names, so pages built against /predict keep rendering
      // without a second inference call. Same values, different keys.
      recommended_crops: ranked.map((r) => r.crop),
      crop_confidences: ranked.map((r) => ({ crop: r.crop, confidence: r.model_probability })),
      prediction_confidence: decision.crop_prediction?.model_probability ?? null,
    };

    // Persistence is best-effort: a database problem must not discard a valid
    // model result the farmer is waiting on.
    if (process.env.DATABASE_URL) {
      try {
        const rainfallUsed = decision.rainfall_feature?.value_mm ?? payload.rainfall ?? 0;
        const soil = await pool.query(
          `INSERT INTO soil_data (n, p, k, ph, moisture, temperature, humidity, rainfall)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id;`,
          [payload.N, payload.P, payload.K, payload.ph, payload.soil_moisture,
           payload.temperature, payload.humidity, rainfallUsed]
        );

        const ranked = decision.decision?.ranked_crops || [];
        await pool.query(
          `INSERT INTO predictions (soil_id, soil_quality, recommended_crops, improvement_tips)
           VALUES ($1,$2,$3,$4);`,
          [
            soil.rows[0].id,
            decision.decision?.recommended_crop ? 'Analyzed' : 'Unknown',
            JSON.stringify(ranked.map((r) => r.crop)),
            JSON.stringify([decision.decision?.explanation, decision.crop_explanation].filter(Boolean)),
          ]
        );
        response.saved = true;
      } catch (dbError) {
        console.error('[ml] crop-decision persistence failed:', dbError.message);
        response.saved = false;
        response.save_error = 'Prediction succeeded but could not be saved to history.';
      }
    } else {
      response.saved = false;
    }

    res.json(response);
  };
}

module.exports = { router, createCropDecisionHandler, ML_SERVICE_URL };
