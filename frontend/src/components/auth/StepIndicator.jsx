export default function StepIndicator({ steps, current, ariaLabel }) {
  const pct = ((Math.min(current, steps.length - 1) + 1) / steps.length) * 100;

  return (
    <div className="auth-progress">
      <ol className="auth-steps" aria-label={ariaLabel || 'Registration progress'}>
        {steps.map((label, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : '';
          return (
            <li key={index} className={state}>
              <span className="auth-step-num">{String(index + 1).padStart(2, '0')}</span>
              <span className="auth-step-label">{label}</span>
            </li>
          );
        })}
      </ol>
      <div className="auth-progress-line" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
