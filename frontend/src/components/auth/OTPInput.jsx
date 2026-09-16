import { useEffect, useRef } from 'react';
import { useLang } from '../../context/LanguageContext';

export default function OTPInput({ value, onChange, error, disabled, autoFocus = true }) {
  const { t } = useLang();
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus && !disabled) refs.current[0]?.focus();
  }, [autoFocus, disabled]);

  const applyCode = (code, start = 0) => {
    const next = digits.slice();
    const chars = String(code).replace(/\D/g, '').slice(0, 6 - start);
    chars.split('').forEach((char, i) => {
      next[start + i] = char;
    });
    onChange(next.join(''));
    refs.current[Math.min(start + chars.length, 5)]?.focus();
  };

  const handleChange = (index, raw) => {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      const next = digits.slice();
      next[index] = '';
      onChange(next.join(''));
      return;
    }
    applyCode(cleaned, index);
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = digits.slice();
      next[index - 1] = '';
      onChange(next.join(''));
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) refs.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    applyCode(e.clipboardData.getData('text'), 0);
  };

  return (
    <div className={`otp-row${error ? ' is-error' : ''}`} role="group" aria-label={t.otp_group}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          className={`otp-box${digit ? ' is-filled' : ''}`}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={index === 0 ? 6 : 1}
          value={digit}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-label={typeof t.otp_digit === 'function' ? t.otp_digit(index + 1) : `${index + 1}`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
}
