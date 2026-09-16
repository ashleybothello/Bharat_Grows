import { useLang } from '../context/LanguageContext';

export default function PageHeader({ kicker, title, lede, tools }) {
  const { t } = useLang();
  return (
    <header className="pg-head">
      <div>
        {kicker ? <p className="pg-kicker">{kicker}</p> : null}
        <h1>{title || t.lp_brand}</h1>
        {lede ? <p className="pg-lede">{lede}</p> : null}
      </div>
      {tools ? <div className="pg-tools">{tools}</div> : null}
    </header>
  );
}
