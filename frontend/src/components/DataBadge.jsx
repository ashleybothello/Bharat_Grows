import { useLang } from '../context/LanguageContext';

export default function DataBadge({ kind = 'waiting', className = '' }) {
  const { t } = useLang();
  const labels = {
    live: t.badge_live,
    waiting: t.badge_waiting,
    demo: t.badge_demo,
    analysis: t.badge_analysis,
    official: t.badge_official,
    error: t.badge_error,
  };

  return (
    <span className={`data-badge data-badge-${kind}${className ? ` ${className}` : ''}`}>
      <span className="data-badge-dot" aria-hidden />
      {labels[kind] || labels.waiting}
    </span>
  );
}
