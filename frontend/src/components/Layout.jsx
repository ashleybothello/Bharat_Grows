import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  History, LayoutDashboard, FlaskConical, Ellipsis,
  LogOut, TrendingUp, Menu, X, Sparkles, Cpu, UserRound, Map, Globe,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import BrandMark from './BrandMark';
import LanguageSelect from './LanguageSelect';
import { openSaathi } from '../pages/dashboard/helpers';

function pathActive(pathname, path) {
  if (path === '/app/market') return pathname.startsWith('/app/market');
  if (path === '/app/iot') return pathname === '/app/iot' || pathname === '/app/map';
  if (path === '/app/gis') return pathname === '/app/gis' || pathname === '/app/satellite';
  return pathname === path;
}

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLang();
  const { farmer, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { name: t.nav_dashboard, path: '/app/dashboard', icon: LayoutDashboard },
    { name: t.nav_analyze, path: '/app/analyze', icon: FlaskConical },
    { name: t.nav_map, path: '/app/iot', icon: Map },
    { name: t.nav_gis, path: '/app/gis', icon: Globe },
    { name: t.nav_history, path: '/app/history', icon: History },
    { name: t.nav_market, path: '/app/market', icon: TrendingUp },
    { name: t.nav_more, path: '/app/more', icon: Ellipsis },
  ];

  const dock = [
    { name: t.nav_home, path: '/app/dashboard', icon: LayoutDashboard },
    { name: t.nav_analyze, path: '/app/analyze', icon: FlaskConical },
    { name: t.nav_map, path: '/app/iot', icon: Map },
    { name: t.nav_history, path: '/app/history', icon: History },
    { name: t.nav_more, path: '/app/more', icon: Ellipsis },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1023) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('app-menu-open', menuOpen);
    return () => document.body.classList.remove('app-menu-open');
  }, [menuOpen]);

  return (
    <>
      <nav className="app-nav" aria-label={t.lp_nav_primary}>
        <div className="app-nav-inner">
          <Link to="/app/dashboard" className="app-nav-brand" aria-label={t.lp_brand}>
            <BrandMark size="sm" inverse />
          </Link>

          <div className="app-nav-links">
            {links.map((link) => {
              const isActive = pathActive(location.pathname, link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`app-nav-link${isActive ? ' is-active' : ''}`}
                >
                  {link.name}
                </Link>
              );
            })}
            <Link to="/beta" className="app-nav-link app-nav-beta">
              {t.nav_beta}
            </Link>
          </div>

          <div className="app-nav-tools">
            <LanguageSelect variant="inverse" />
            {(farmer?.name || farmer?.profile?.fullName) && (
              <Link to="/app/profile" className="app-farmer">
                {farmer.name || farmer.profile?.fullName}
              </Link>
            )}
            <button
              id="logout-btn"
              className="app-logout"
              onClick={handleLogout}
              title={t.nav_logout}
            >
              <LogOut size={14} />
              <span className="app-logout-label">{t.nav_logout}</span>
            </button>
            <button
              type="button"
              className="app-menu-btn"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? t.lp_menu_close : t.pg_menu}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
              <span>{t.pg_menu}</span>
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="app-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <nav className="app-sheet-inner" aria-label={t.lp_nav_mobile}>
              {[
                ...links,
                { name: t.dash_saathi, path: '#saathi', icon: Sparkles, action: () => { openSaathi(); setMenuOpen(false); } },
                { name: t.nav_beta, path: '/beta', icon: Cpu },
                { name: t.pg_account, path: '/app/profile', icon: UserRound },
              ].map((link) => {
                const Icon = link.icon;
                if (link.action) {
                  return (
                    <button type="button" key={link.name} onClick={link.action}>
                      <Icon size={18} /> {link.name}
                    </button>
                  );
                }
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={pathActive(location.pathname, link.path) ? 'is-active' : ''}
                  >
                    <Icon size={18} /> {link.name}
                  </Link>
                );
              })}
              <div className="app-sheet-lang">
                <LanguageSelect />
              </div>
              <button type="button" onClick={handleLogout}>
                <LogOut size={18} /> {t.nav_logout}
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="app-dock" aria-label={t.lp_nav_mobile}>
        {dock.map((link) => {
          const Icon = link.icon;
          const isActive = pathActive(location.pathname, link.path);
          return (
            <Link
              key={link.path}
              to={link.path}
              className={isActive ? 'is-active' : ''}
            >
              <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
              {link.name}
            </Link>
          );
        })}
      </nav>
    </>
  );
};

const Layout = () => {
  const location = useLocation();
  const reduce = useReducedMotion();
  const isGis = location.pathname === '/app/gis' || location.pathname === '/app/satellite';

  return (
    <div className={`app-shell${isGis ? ' is-gis' : ''}`}>
      <Navbar />
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: reduce ? 0.12 : 0.28, ease: [0.16, 1, 0.3, 1] }}
          className={`page-container${isGis ? ' is-gis' : ''}`}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </div>
  );
};

export default Layout;
