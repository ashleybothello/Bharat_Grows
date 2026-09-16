import { useReducedMotion } from 'framer-motion';
import { useLang } from '../../context/LanguageContext';
import FieldFilm, { HERO_VIDEO } from '../FieldFilm';

const POSTER = '/farm_hero.png';

export default function AuthProductPanel({ variant = 'login' }) {
  const { t } = useLang();
  const reduce = useReducedMotion();
  const signup = variant === 'signup';

  const rows = [
    { id: 'soil', name: t.lp_nav_soil, sub: t.auth_panel_soil_sub },
    { id: 'crop', name: t.lp_intro_crop_t, sub: t.auth_panel_crop_sub },
    { id: 'market', name: t.lp_nav_market, sub: t.auth_panel_market_sub },
    { id: 'saathi', name: t.lp_nav_saathi, sub: t.auth_panel_saathi_sub },
  ];

  return (
    <aside className="auth-product" aria-hidden="true">
      {reduce ? (
        <img className="auth-product-still" src={POSTER} alt="" decoding="async" />
      ) : (
        <FieldFilm
          className="auth-product-film"
          src={HERO_VIDEO}
          poster={POSTER}
          preload="auto"
        />
      )}
      <div className="auth-product-shade" />
      <div className="auth-product-copy">
        <div className="auth-product-bar">
          <span>{t.lp_brand}</span>
          <span>{t.pf_field_intel}</span>
        </div>
        <h2>{signup ? t.lp_intro_h2 : `${t.lp_hero_line1} ${t.lp_hero_line2}`}</h2>
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <span>{row.name}</span>
              <em>{row.sub}</em>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
