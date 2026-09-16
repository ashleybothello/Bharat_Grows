export default function EmptyState({
  icon: Icon,
  title,
  body,
  children,
  tone = 'waiting',
}) {
  return (
    <div className={`empty-state empty-state-${tone}`}>
      {Icon && (
        <div className="empty-state-icon" aria-hidden>
          <Icon size={28} strokeWidth={1.75} />
        </div>
      )}
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {children}
    </div>
  );
}
