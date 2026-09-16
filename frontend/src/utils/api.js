import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005';

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
