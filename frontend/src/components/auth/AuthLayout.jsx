import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import BrandMark from '../BrandMark';
import LanguageSelect from '../LanguageSelect';
import AuthProductPanel from './AuthProductPanel';
import { useLang } from '../../context/LanguageContext';

export default function AuthLayout({
  children,
  variant = 'login',
}) {
  const signup = variant === 'signup';
  const { t } = useLang();

  return (
    <div className={`auth-shell auth-${variant}`}>
      <header className="auth-bar">
        <div className="auth-bar-inner">
          <Link to="/" className="auth-brand" aria-label={t.lp_brand}>
            <BrandMark size="sm" />
          </Link>
          <div className="auth-bar-actions">
            <LanguageSelect />
            {signup ? (
              <>
                <span className="auth-bar-hint">{t.auth_already}</span>
                <Link to="/login" className="auth-bar-link">{t.lp_sign_in}</Link>
              </>
            ) : (
              <Link to="/" className="auth-bar-link">
                {t.auth_back_home} <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
          <div className="auth-bar-mobile">
            <LanguageSelect />
            <Link to="/" className="auth-bar-back" aria-label={t.auth_back_home}>
              <ArrowLeft size={20} />
            </Link>
          </div>
        </div>
      </header>

      <div className="auth-strip">
        <span>{t.lp_brand}</span>
        <strong>{t.lp_intro_h2}</strong>
      </div>

      <div className="auth-stage">
        <main className="auth-main">
          {children}
        </main>
        <AuthProductPanel variant={variant} />
      </div>
    </div>
  );
}
