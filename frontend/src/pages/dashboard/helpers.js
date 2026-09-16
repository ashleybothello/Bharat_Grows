import { localeFor } from '../../utils/i18n-catalog';

export const ease = [0.16, 1, 0.3, 1];
export function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return 'dash_morning';
  if (hour < 17) return 'dash_afternoon';
  return 'dash_evening';
}

export function cropsOf(row) {
  const raw = row?.recommended_crops;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function qualityLabel(value, t) {
  if (value === 'Good' || value === 'GOOD') return t.health_good || t.status_good || t.pf_health_good;
  if (value === 'Moderate' || value === 'AVERAGE') return t.health_average || t.status_average || t.dash_quality_mod;
  if (value === 'Poor' || value === 'BAD') return t.health_bad || t.status_bad || t.dash_quality_poor;
  if (value === 'CRITICAL') return t.health_critical || t.status_critical;
  return value || '—';
}

export function healthLabel(status, t) {
  return qualityLabel(status, t);
}

export function cropLabel(name, t) {
  if (!name) return t.dash_not_analyzed;
  const key = `crop_${String(name).toLowerCase().replace(/\s+/g, '')}`;
  if (t[key]) return t[key];
  if (String(name).toLowerCase() === 'wheat') return t.lp_wheat || t.crop_wheat;
  return name;
}

export function farmerPlace(farmer) {
  const profile = farmer?.profile || farmer || {};
  return [profile.village || farmer?.village, profile.district, profile.state]
    .filter(Boolean)
    .join(', ');
}

export function openSaathi() {
  document.querySelector('.saathi-fab')?.click();
}

export function fade(reduce, delay = 0) {
  if (reduce) return {};
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.42, delay, ease },
  };
}

export function formatDashDate(iso, lang) {
  if (!iso) return '';
  const locale = localeFor(lang);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    const [year, month, day] = String(iso).split('-');
    if (!year || !month || !day) return String(iso);
    return new Date(Number(year), Number(month) - 1, Number(day))
      .toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso, lang) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString(localeFor(lang));
}
