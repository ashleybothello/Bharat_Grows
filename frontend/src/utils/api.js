import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? 'http://localhost:5005' : '');

/**
 * Full field analysis: crop model + rainfall intelligence + mandi prices,
 * combined by the decision engine.
 *
 * Everything goes through Express, which owns the ML service URL, the market
 * API key and the model files. The browser never sees any of them.
 */
export async function requestCropDecision(payload) {
  const { data } = await axios.post(`${API_URL}/api/ml/crop-decision`, payload, {
    timeout: 45000,
  });
  return data;
}

/**
 * Rule-based rainfall intelligence (Open-Meteo + IMD baseline).
 * Not a trained rainfall model. Express still owns the ML service URL.
 */
export async function requestRainfallIntelligence(payload) {
  const { data } = await axios.post(`${API_URL}/api/ml/rainfall-intelligence`, payload, {
    timeout: 25000,
  });
  return data;
}

export const PEST_ERROR_CODES = {
  NO_IMAGE: 'NO_IMAGE',
  INVALID_FILE: 'INVALID_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNRECOGNIZED: 'PEST_IMAGE_UNRECOGNIZED',
  PLANT: 'PLANT_NOT_DETECTED',
  INSECT: 'INSECT_NOT_DETECTED',
  DISEASE: 'DISEASE_NOT_DETECTED',
  KEY: 'PEST_API_KEY',
  UNCONFIGURED: 'PEST_API_UNCONFIGURED',
  QUOTA: 'PEST_API_QUOTA',
  TIMEOUT: 'PEST_API_TIMEOUT',
  UNAVAILABLE: 'PEST_API_UNAVAILABLE',
  FAILED: 'PEST_API_FAILED',
};

/**
 * Upload a leaf or insect photo to Express. Express calls Kindwise; the
 * browser never sees plant.id / insect.id keys.
 */
export async function detectPestFromImage(file, kind = 'leaf') {
  const form = new FormData();
  form.append('image', file);
  form.append('kind', kind === 'insect' ? 'insect' : 'leaf');
  const { data } = await axios.post(`${API_URL}/api/pest/detect`, form, {
    timeout: 60000,
  });
  return data;
}

export function pestErrorMessage(error, t) {
  const payload = error?.response?.data;
  const code = payload?.code;
  switch (code) {
    case PEST_ERROR_CODES.NO_IMAGE:
      return t.pg_pest_err_no_image;
    case PEST_ERROR_CODES.INVALID_FILE:
      return t.pg_pest_err_invalid;
    case PEST_ERROR_CODES.FILE_TOO_LARGE:
      return t.pg_pest_err_large;
    case PEST_ERROR_CODES.UNRECOGNIZED:
    case PEST_ERROR_CODES.PLANT:
      return t.pg_pest_err_unrecognized;
    case PEST_ERROR_CODES.INSECT:
      return t.pg_pest_err_unrecognized_insect || t.pg_pest_err_unrecognized;
    case PEST_ERROR_CODES.DISEASE:
      return t.pg_pest_no_disease;
    case PEST_ERROR_CODES.KEY:
      return t.pg_pest_err_key;
    case PEST_ERROR_CODES.UNCONFIGURED:
      return t.pg_pest_err_unconfigured;
    case PEST_ERROR_CODES.QUOTA:
      return t.pg_pest_err_quota;
    case PEST_ERROR_CODES.TIMEOUT:
      return t.pg_pest_err_timeout;
    case PEST_ERROR_CODES.UNAVAILABLE:
    case PEST_ERROR_CODES.FAILED:
      return t.pg_pest_err_down;
    default:
      break;
  }
  if (error?.code === 'ECONNABORTED') return t.pg_pest_err_timeout;
  if (!error?.response) return t.pg_err_backend_down || t.pg_pest_err_down;
  return t.pg_pest_err_unrecognized;
}

/** Stable error codes the ML routes return, so the UI can pick its own wording. */
export const ML_ERROR_CODES = {
  UNAVAILABLE: 'ML_SERVICE_UNAVAILABLE',
  TIMEOUT: 'ML_SERVICE_TIMEOUT',
  INVALID: 'ML_INVALID_INPUT',
  BAD_INPUT: 'INVALID_INPUT',
  SERVICE: 'ML_SERVICE_ERROR',
};

/**
 * Turn a failed ML request into a message for the farmer.
 *
 * Returns the reason the request failed — never a fabricated result. `t` is the
 * active translation table; the server's own text is used only as a last resort
 * so an unmapped code still says something concrete.
 */
export function mlErrorMessage(error, t) {
  const payload = error?.response?.data;
  const code = payload?.code;

  switch (code) {
    case ML_ERROR_CODES.UNAVAILABLE:
      return t.pg_err_ml_down;
    case ML_ERROR_CODES.TIMEOUT:
      return t.pg_err_ml_timeout;
    case ML_ERROR_CODES.INVALID:
    case ML_ERROR_CODES.BAD_INPUT:
      return payload?.error || t.pg_err_ml_input;
    case ML_ERROR_CODES.SERVICE:
      return t.pg_err_ml_failed;
    default:
      break;
  }

  if (error?.code === 'ECONNABORTED') return t.pg_err_ml_timeout;
  if (!error?.response) return t.pg_err_backend_down;
  return payload?.error || t.pg_err_predict;
}
