import { normalizeMobile } from '../../utils/auth';
import { useLang } from '../../context/LanguageContext';

export default function PhoneInput({
  id = 'phone-input',
  value,
  onChange,
  disabled,
  error,
  autoFocus,
}) {
  const { t } = useLang();

  return (
    <div className={`auth-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{t.label_mobile}</label>
      <div className="auth-phone">
        <span>+91</span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={16}
          placeholder={t.ph_mobile}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(normalizeMobile(e.target.value))}
        />
      </div>
      {error ? <p className="auth-error-text">{error}</p> : null}
    </div>
  );
}
