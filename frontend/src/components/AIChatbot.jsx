import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, Volume2, Send, MicOff, Sparkles, Droplets, Sprout, CloudSun } from 'lucide-react';
import axios from 'axios';
import { useLang, tFor } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../utils/api';
import { readSession } from '../utils/auth';
import { fetchAnomalies, fetchNodes } from '../utils/telemetry';
import { fetchMarketSummary } from '../utils/market';
import { cropsOf, cropLabel, qualityLabel } from '../pages/dashboard/helpers';
import { readLatestAnalysis } from '../utils/latestAnalysis';
import { planIntent } from '../utils/saathi/intent';
import { actionsFromChatPayload, executePlan } from '../utils/saathi/executor';
import { getUiContext, rememberSaathiFocus, setUiContext } from '../utils/saathi/bus';
import { formatActionReply, formatDataReply } from '../utils/saathi/reply';
import { getSaathiData } from '../utils/saathi/data';
import { formatInfoReply } from '../utils/saathi/summary';
import { LANGUAGES, BCP47, detectReplyLang } from '../utils/i18n-catalog';

function SaathiBlocks({ blocks }) {
  if (!blocks) return null;
  return (
    <div className="saathi-card">
      {blocks.title ? <h3>{blocks.title}</h3> : null}
      {blocks.overall ? <p className="saathi-overall">{blocks.overall}</p> : null}
      {(blocks.sections || []).map((sec, idx) => (
        <section key={`${sec.heading || 'sec'}-${idx}`}>
          {sec.heading ? <h4>{sec.heading}</h4> : null}
          {sec.rows?.length ? (
            <dl>
              {sec.rows.map((row) => (
                <div key={`${row.label}-${row.value}`}>
                  <dt>{row.label}</dt>
                  <dd>
                    {row.value}
                    {row.status ? <span className="saathi-st">{row.status}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {sec.body ? <p>{sec.body}</p> : null}
        </section>
      ))}
      {blocks.conclusion ? <p className="saathi-end">{blocks.conclusion}</p> : null}
      {blocks.note ? <p className="saathi-note">{blocks.note}</p> : null}
    </div>
  );
}

const AIChatbot = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const hideOn = location.pathname === '/' || location.pathname === '/beta' || location.pathname === '/login' || location.pathname === '/signup';
  const onApp = location.pathname.startsWith('/app');
  const { lang, setLang, t } = useLang();
  const { farmer } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [noVoice, setNoVoice] = useState(false);
  const [input, setInput] = useState('');
  const [latestData, setLatestData] = useState(null);
  const [nodesPack, setNodesPack] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [market, setMarket] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [micError, setMicError] = useState('');
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!onApp) return undefined;
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const res = await axios.get(`${API_URL}/history`);
        if (!cancelled && res.data?.length) setLatestData(res.data[0]);
      } catch {
        /* history is optional context */
      }
    };

    const loadLive = async () => {
      try {
        const [pack, events] = await Promise.all([
          fetchNodes(),
          fetchAnomalies({ limit: 8 }),
        ]);
        if (cancelled) return;
        setNodesPack(pack);
        setAnomalies(events.rows || []);
      } catch {
        if (!cancelled) {
          setNodesPack(null);
          setAnomalies([]);
        }
      }
    };

    const loadMarket = async () => {
      try {
        const res = await fetchMarketSummary({
          state: farmer?.profile?.state || farmer?.state || '',
          district: farmer?.profile?.district || '',
          pin: farmer?.profile?.primaryCrop || '',
        });
        if (!cancelled && res.ok && res.data?.success) setMarket(res.data);
      } catch {
        if (!cancelled) setMarket(null);
      }
    };

    loadHistory();
    loadLive();
    loadMarket();
    const timer = window.setInterval(loadLive, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [onApp, farmer]);

  const nodes = nodesPack?.nodes || [];
  const liveNode = nodes.find((n) => n.lastReadingAt) || nodes[0] || null;
  const lastAnalysis = readLatestAnalysis();
  const crops = lastAnalysis?.crop_prediction?.recommended_crop
    ? [lastAnalysis.crop_prediction.recommended_crop, ...(lastAnalysis.recommended_crops || [])]
      .filter((name, idx, arr) => name && arr.indexOf(name) === idx)
    : cropsOf(latestData);
  const crop = crops[0] || farmer?.profile?.primaryCrop || null;

  const compactContext = useMemo(() => {
    const profile = farmer?.profile || {};
    return {
      soil_quality: latestData?.soil_quality || null,
      recommended_crops: crops,
      n: lastAnalysis?.crop_prediction?.features_received?.N ?? latestData?.n ?? null,
      p: lastAnalysis?.crop_prediction?.features_received?.P ?? latestData?.p ?? null,
      k: lastAnalysis?.crop_prediction?.features_received?.K ?? latestData?.k ?? null,
      ph: lastAnalysis?.crop_prediction?.features_received?.ph ?? latestData?.ph ?? null,
      improvement_tips: latestData?.improvement_tips || null,
      latestAnalysis: lastAnalysis,
      crop_prediction: lastAnalysis?.crop_prediction || null,
      rainfall_intelligence: lastAnalysis?.rainfall_intelligence || null,
      farmer: {
        name: farmer?.name || profile.fullName || null,
        village: farmer?.village || profile.village || null,
        district: profile.district || null,
        state: profile.state || null,
        primaryCrop: profile.primaryCrop || null,
        farmName: profile.farmName || null,
      },
      farm: nodesPack?.farm || null,
      tally: nodesPack?.tally || null,
      nodes: nodes.map((node) => ({
        nodeNumber: node.nodeNumber,
        zone: node.zone,
        health: node.health,
        lastReadingAt: node.lastReadingAt,
        sensors: node.sensors,
        criticalSensors: node.criticalSensors,
      })),
      selectedNode: liveNode ? {
        nodeNumber: liveNode.nodeNumber,
        zone: liveNode.zone,
        health: liveNode.health,
        sensors: liveNode.sensors,
        criticalSensors: liveNode.criticalSensors,
      } : null,
      recentAnomalies: anomalies.slice(0, 8).map((row) => ({
        nodeNumber: row.node_number,
        sensor: row.sensor,
        value: row.value,
        severity: row.severity,
        detectedAt: row.detected_at,
      })),
      marketSummary: market?.commodities
        ? {
            source: market.source,
            available: market.commodities.length > 0,
            lastUpdated: market.lastUpdated,
            crops: market.commodities.slice(0, 8).map((row) => ({
              commodity: row.commodity,
              market: row.market,
              modalPrice: row.modalPrice,
              unit: row.unit,
              date: row.date,
            })),
          }
        : null,
    };
  }, [latestData, crops, farmer, nodesPack, nodes, liveNode, anomalies, market, lastAnalysis]);

  const soilChip = (() => {
    const critical = nodes.filter((n) => n.health === 'CRITICAL').length;
    const watch = nodes.filter((n) => n.health === 'AVERAGE' || n.health === 'BAD').length;
    if (critical) return t.pg_dash_critical;
    if (watch) return t.pg_dash_warning;
    if (nodes.some((n) => n.health === 'GOOD')) return t.pg_dash_healthy;
    if (latestData?.soil_quality) return qualityLabel(latestData.soil_quality, t);
    if (latestData) return t.dash_saathi_soil_last;
    return t.dash_saathi_awaiting;
  })();

  const cropChip = crop ? cropLabel(crop, t) : t.dash_saathi_awaiting;
  const temp = liveNode?.sensors?.temperature?.value;
  const weatherChip = temp != null && Number.isFinite(Number(temp))
    ? `${Math.round(Number(temp))}°C`
    : t.dash_saathi_awaiting;

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{ sender: 'bot', text: t.greeting, kind: 'intro' }]);
    }
  }, [isOpen, t.greeting]);

  useEffect(() => {
    if (isOpen) {
      setMessages((prev) => {
        if (prev.length > 0 && prev[0].sender === 'bot') {
          const updated = [...prev];
          updated[0] = { ...updated[0], text: t.greeting };
          return updated;
        }
        return prev;
      });
    }
  }, [lang, t.greeting, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    setUiContext({
      currentRoute: location.pathname,
      primaryCrop: farmer?.profile?.primaryCrop || null,
    });
  }, [location.pathname, farmer]);

  const handleSend = async (text = input) => {
    if (!text.trim()) return;
    const userMsg = text.trim();
    setMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);
    setMicError('');

    const ui = { ...getUiContext(), currentRoute: location.pathname };
    const plan = planIntent(userMsg, ui);
    const replyT = tFor(detectReplyLang(userMsg, lang));

    try {
      if (plan.mode === 'action' || plan.mode === 'data' || plan.mode === 'info') {
        const results = plan.actions?.length
          ? await executePlan(plan, { navigate, pathname: location.pathname })
          : [];
        rememberSaathiFocus(plan, results);
        if (plan.mode === 'data') {
          const data = await getSaathiData(plan, results, { nodesPack, farmer });
          const reply = formatDataReply(plan, {
            nodesPack: data.pack || nodesPack,
            anomalies: data.anomalies || anomalies,
            lastAnalysis,
            farmer,
          }, replyT);
          setMessages((prev) => [...prev, { sender: 'bot', text: reply, kind: 'answer' }]);
          return;
        }
        if (plan.mode === 'info') {
          const data = await getSaathiData(plan, results, { nodesPack, farmer });
          const packed = formatInfoReply(plan, data, results, replyT);
          setMessages((prev) => [...prev, {
            sender: 'bot',
            text: packed.text,
            blocks: packed.blocks,
            kind: 'answer',
          }]);
          return;
        }
        const reply = formatActionReply(plan, results, replyT);
        setMessages((prev) => [...prev, { sender: 'bot', text: reply, kind: 'answer' }]);
        return;
      }

      const token = readSession()?.token;
      const res = await axios.post(`${API_URL}/api/chat`, {
        message: userMsg,
        lang_code: lang,
        context: {
          ...compactContext,
          ui,
        },
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.data && res.data.success) {
        const payload = res.data.data || {};
        const { response, action } = payload;
        setMessages((prev) => [...prev, { sender: 'bot', text: response || '...', kind: 'answer' }]);

        const remote = actionsFromChatPayload(payload);
        if (remote.length) {
          await executePlan({ intent: payload.intent || 'CONVERSATION', actions: remote }, { navigate, pathname: location.pathname });
        } else if (action?.startsWith('fill_phone:')) {
          const num = action.split(':')[1];
          if (num) window.dispatchEvent(new CustomEvent('fill_phone', { detail: num }));
        } else if (action?.startsWith('send_sms:')) {
          const num = action.split(':')[1];
          navigate('/app/communication');
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('send_sms', { detail: num }));
          }, 600);
        }
      } else {
        setMessages((prev) => [...prev, { sender: 'bot', text: t.bot_default, kind: 'answer' }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        sender: 'bot',
        text: t.dash_saathi_down,
        kind: 'error',
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSpeechOutput = (text) => {
    if (!('speechSynthesis' in window)) {
      setMicError(t.dash_listen_need);
      return;
    }
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = BCP47[lang] || 'en-IN';
    const voices = window.speechSynthesis.getVoices();
    const localVoice = voices.find((v) => v.lang === msg.lang);
    if (localVoice) msg.voice = localVoice;
    window.speechSynthesis.speak(msg);
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNoVoice(true);
      setMicError(t.dash_mic_need);
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = BCP47[lang] || 'en-IN';
      recognition.onstart = () => {
        setListening(true);
        setMicError(t.dash_listening);
      };
      recognition.onerror = (e) => {
        setListening(false);
        setMicError(e.error === 'not-allowed' ? t.dash_mic_denied : t.dash_mic_denied);
      };
      recognition.onend = () => {
        setListening(false);
        setTimeout(() => setMicError(''), 1800);
      };
      recognition.onresult = (event) => {
        setMicError('');
        handleSend(event.results[0][0].transcript);
      };
      recognition.start();
    } catch {
      setMicError(t.dash_mic_denied);
    }
  };

  if (hideOn) return null;

  return (
    <div className={`saathi-wrap${isOpen ? ' is-open' : ''}`}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="saathi-panel"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="saathi-head">
              <div className="saathi-mark">
                <Sparkles size={18} />
              </div>
              <div>
                <strong>{t.dash_saathi}</strong>
                <p>{t.dash_saathi_expand}</p>
              </div>
              <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t.dash_saathi_lang}>
                {LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
              <button type="button" className="saathi-icon-btn" onClick={() => setIsOpen(false)} aria-label={t.dash_saathi_close}>
                <X size={16} />
              </button>
            </header>

            <aside className="saathi-context">
              <span><Sprout size={13} /> {t.dash_ask_soil} · {soilChip}</span>
              <span><Droplets size={13} /> {t.dash_crop} · {cropChip}</span>
              <span><CloudSun size={13} /> {t.dash_weather} · {weatherChip}</span>
            </aside>

            <div className="saathi-thread">
              {messages.map((m, idx) => (
                <div key={idx} className={`saathi-msg ${m.sender}`}>
                  <div className={`saathi-bubble ${m.kind || ''}${m.blocks ? ' has-card' : ''}`}>
                    {m.blocks ? <SaathiBlocks blocks={m.blocks} /> : m.text}
                  </div>
                  {m.sender === 'bot' && (
                    <button type="button" className="saathi-listen" onClick={() => handleSpeechOutput(m.text)}>
                      <Volume2 size={12} /> {t.dash_listen}
                    </button>
                  )}
                </div>
              ))}
              {isTyping && (
                <div className="saathi-msg bot">
                  <div className="saathi-bubble">{t.dash_saathi_connecting}</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="saathi-suggest">
              {[t.dash_suggest_1, t.dash_suggest_2, t.dash_suggest_3, t.dash_suggest_4].map((q) => (
                <button key={q} type="button" onClick={() => handleSend(q)}>{q}</button>
              ))}
            </div>

            <form
              className="saathi-composer"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              {micError && <p className={`saathi-mic-note${listening ? ' is-live' : ''}`}>{micError}</p>}
              <button type="button" onClick={handleVoiceInput} aria-label={t.dash_voice}>
                {noVoice ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t.chat_placeholder}
                aria-label={t.dash_talk}
              />
              <button type="submit" className="saathi-send" aria-label={t.dash_send}>
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        className="chat-fab saathi-fab"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? t.dash_saathi_close : t.dash_saathi_open}
      >
        {isOpen ? <X size={24} /> : <Sparkles size={22} />}
      </button>
    </div>
  );
};

export default AIChatbot;
