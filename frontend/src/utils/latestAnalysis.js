const KEY = 'bharatgrow.latestAnalysis';

/**
 * The last completed Analyze → /api/ml/crop-decision payload.
 * SAATHI, Results (same tab), Weather Intelligence and the Crop Calendar
 * read this so they quote the same crop/rainfall outputs — never a second
 * invented prediction.
 */
export function saveLatestAnalysis(payload) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — Analyze → Results navigation state still works */
  }
}

export function readLatestAnalysis() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
