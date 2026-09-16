import { Link } from 'react-router-dom';
import BrandMark from '../../components/BrandMark';
import { useLang } from '../../context/LanguageContext';
import { scrollToId } from './motion';

export default function Footer() {
  const { t } = useLang();
  const go = (id) => (e) => {
    e.preventDefault();
    scrollToId(id);
  };

  return (
    <footer className="lp-foot">
      <div className="lp-wrap lp-foot-grid">
        <div>
          <BrandMark size="sm" />
          <p>{t.lp_foot_tag}</p>
        </div>
        <div>
          <h3>{t.lp_foot_product}</h3>
          <a href="#/soil" onClick={go('soil')}>{t.lp_nav_soil}</a>
          <a href="#/crop" onClick={go('crop')}>{t.lp_nav_intel}</a>
          <a href="#/market" onClick={go('market')}>{t.lp_nav_market}</a>
          <a href="#/saathi" onClick={go('saathi')}>{t.lp_nav_saathi}</a>
          <a href="#/hardware" onClick={go('hardware')}>{t.lp_nav_hardware}</a>
        </div>
        <div>
          <h3>{t.lp_foot_company}</h3>
          <a href="#/intro" onClick={go('intro')}>{t.lp_foot_about}</a>
          <a href="#/hardware" onClick={go('hardware')}>{t.lp_foot_arch}</a>
          <Link to="/signup">{t.lp_foot_contact}</Link>
        </div>
        <div>
          <h3>{t.lp_foot_resources}</h3>
          <a href="#/how" onClick={go('how')}>{t.lp_foot_docs}</a>
          <Link to="/beta">{t.lp_hw_flag}</Link>
        </div>
      </div>
      <div className="lp-wrap lp-foot-legal">
        <span>© 2026 {t.lp_brand}</span>
        <span>{t.lp_foot_legal}</span>
      </div>
    </footer>
  );
}
