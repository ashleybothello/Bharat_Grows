import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import BrandMark from '../../components/BrandMark';
import LanguageSelect from '../../components/LanguageSelect';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { scrollToId } from './motion';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  const { isAuthed, logout } = useAuth();
  const { t } = useLang();

  const links = [
    { id: 'soil', label: t.lp_nav_soil },
    { id: 'crop', label: t.lp_nav_intel },
    { id: 'saathi', label: t.lp_nav_saathi },
    { id: 'market', label: t.lp_nav_market },
    { id: 'hardware', label: t.lp_nav_hardware },
  ];

  useEffect(() => {
    const close = () => {
      if (window.innerWidth > 1023) setOpen(false);
    };
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const go = (id) => (e) => {
    e.preventDefault();
    setOpen(false);
    scrollToId(id, reduce);
  };

  return (
    <header className={`lp-nav${open ? ' is-open' : ''}${scrolled ? ' is-scrolled' : ''}`}>
      <div className="lp-nav-inner">
        <Link to="/" className="lp-brand" aria-label={`${t.lp_brand} home`}>
          <BrandMark size="sm" inverse />
        </Link>
        <nav className="lp-nav-links" aria-label={t.lp_nav_primary}>
          {links.map((link) => (
            <a key={link.id} href={`#/${link.id}`} onClick={go(link.id)}>{link.label}</a>
          ))}
        </nav>
        <div className="lp-nav-actions">
          <LanguageSelect variant="inverse" />
          {isAuthed ? (
            <>
              <button type="button" className="lp-nav-text" onClick={logout}>{t.lp_sign_out}</button>
              <Link to="/app/dashboard" className="lp-btn lp-btn-light">
                {t.lp_open_dashboard} <ArrowUpRight size={15} />
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="lp-nav-text">{t.lp_sign_in}</Link>
              <Link to="/signup" className="lp-btn lp-btn-light">
                {t.lp_get_started} <ArrowUpRight size={15} />
              </Link>
            </>
          )}
          <button
            type="button"
            className="lp-menu"
            aria-expanded={open}
            aria-label={open ? t.lp_menu_close : t.lp_menu_open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            className="lp-drawer"
            aria-label={t.lp_nav_mobile}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <LanguageSelect variant="inverse" />
            {links.map((link) => (
              <a key={link.id} href={`#/${link.id}`} onClick={go(link.id)}>{link.label}</a>
            ))}
            {isAuthed ? (
              <>
                <button type="button" className="lp-nav-text" onClick={() => { logout(); setOpen(false); }}>{t.lp_sign_out}</button>
                <Link to="/app/dashboard" className="lp-btn lp-btn-light" onClick={() => setOpen(false)}>
                  {t.lp_open_dashboard} <ArrowUpRight size={15} />
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setOpen(false)}>{t.lp_sign_in}</Link>
                <Link to="/signup" className="lp-btn lp-btn-light" onClick={() => setOpen(false)}>
                  {t.lp_get_started} <ArrowUpRight size={15} />
                </Link>
              </>
            )}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
