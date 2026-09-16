import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Send, ShieldAlert, CheckCircle, WifiOff, Sprout, Globe, Zap, FileText, XCircle, Mic, Check, CheckCheck } from 'lucide-react';
import axios from 'axios';
import { translations } from '../utils/i18n';
import { useLang } from '../context/LanguageContext';
import { API_URL } from '../utils/api';
import PageHeader from '../components/PageHeader';

const Communication = () => {
  const [offline, setOffline] = useState(false);
  
  // SMS State
  const [phone, setPhone] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState('success');

  // Global language
  const { lang, setLang, t } = useLang();

  // Whatsapp State — synced with global lang
  const [waLang, setWaLang] = useState(lang);
  const tWa = translations[waLang] || translations['en'];
  const [waMessages, setWaMessages] = useState([]);
  const [waInput, setWaInput] = useState('');
  const [waTyping, setWaTyping] = useState(false);
  const waEndRef = useRef(null);

  // Last Analysis Data
  const [lastAnalysis, setLastAnalysis] = useState(null);

  const getTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await axios.get(`${API_URL}/history`);
        if (res.data && res.data.length > 0) setLastAnalysis(res.data[0]);
      } catch(err) {
        console.error('Failed to fetch history', err);
      }
    };
    fetchLatest();
  }, []);

  // Initialize WhatsApp greeting when language changes
  useEffect(() => {
    const t = translations[waLang] || translations['en'];
    setWaMessages([{ sender: 'bot', text: t.greeting, time: getTime() }]);
  }, [waLang]);

  // Auto-scroll WhatsApp chat
  useEffect(() => {
    waEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [waMessages, waTyping]);

  // AI Voice Auto-Fill Listener
  useEffect(() => {
    const handleAutoFill = (e) => {
      const num = e.detail;
      setPhone(num);
      const input = document.getElementById('comm-phone-input');
      if (input) {
         input.focus();
         input.style.color = '#10B981';
         input.style.borderColor = '#10B981';
         setTimeout(() => {
            input.style.color = 'var(--text-main)';
            input.style.borderColor = 'rgba(255,255,255,0.1)';
         }, 1500);
      }
    };
    window.addEventListener('fill_phone', handleAutoFill);
    return () => window.removeEventListener('fill_phone', handleAutoFill);
  }, []);

  // AI "Send SMS" Command Listener — auto-fills phone + last soil analysis message
  useEffect(() => {
    const handleSendSms = (e) => {
      const num = e.detail;
      if (num) setPhone(num);

      // Auto-fill message with last analysis
      if (lastAnalysis) {
        const crops = lastAnalysis.recommended_crops?.join(', ') || 'N/A';
        const tips = lastAnalysis.improvement_tips?.[0] || '';
        const quality = lastAnalysis.soil_quality || 'Unknown';
        const autoMsg = `SoilAI Alert:\nSoil Quality: ${quality}\nNitrogen: ${lastAnalysis.n}, Phosphorus: ${lastAnalysis.p}, Potassium: ${lastAnalysis.k}\npH: ${lastAnalysis.ph}\nRecommended Crops: ${crops}\nAction: ${tips}`;
        setSmsMessage(autoMsg);
        showToast('Phone and soil analysis auto-filled by भारतGrows AI.', 'success');
      } else {
        showToast('No soil analysis available yet. Run one first!', 'error');
      }

      // Highlight the phone input
      setTimeout(() => {
        const input = document.getElementById('comm-phone-input');
        if (input) {
          input.style.color = '#10B981';
          input.style.borderColor = '#10B981';
          setTimeout(() => {
            input.style.color = 'var(--text-main)';
            input.style.borderColor = 'rgba(255,255,255,0.1)';
          }, 1500);
        }
      }, 100);
    };
    window.addEventListener('send_sms', handleSendSms);
    return () => window.removeEventListener('send_sms', handleSendSms);
  }, [lastAnalysis]);

  const showToast = (msg, type = 'success') => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(''), 4000);
  };

  const handleUseLastAnalysis = () => {
    if (!lastAnalysis) {
      showToast('No analysis data found. Run a soil analysis first!', 'error');
      return;
    }
    const crops = lastAnalysis.recommended_crops?.join(', ') || 'N/A';
    const tips = lastAnalysis.improvement_tips?.[0] || '';
    const quality = lastAnalysis.soil_quality || 'Unknown';
    const autoMsg = `SoilAI Alert:\nSoil Quality: ${quality}\nNitrogen: ${lastAnalysis.n}, Phosphorus: ${lastAnalysis.p}, Potassium: ${lastAnalysis.k}\npH: ${lastAnalysis.ph}\nRecommended Crops: ${crops}\nAction: ${tips}`;
    setSmsMessage(autoMsg);
    showToast('Message auto-filled from latest soil analysis!', 'success');
  };

  const handleSendSMS = async (e) => {
    e.preventDefault();
    if (!smsMessage.trim()) {
      showToast('Please enter a message or click "Use Last Analysis"', 'error');
      return;
    }
    setSmsSending(true);
    try {
      const res = await axios.post(`${API_URL}/api/send-sms`, { 
        phone, 
        message: smsMessage 
      });
      
      if (res.data.success) {
        showToast(`✅ SMS sent successfully! ID: ${res.data.request_id}`, 'success');
      }
    } catch(err) {
      const errMsg = err.response?.data?.error || 'Connection failed. Is the server running?';
      console.error('[SMS Frontend Error]:', errMsg);
      showToast(`❌ Failed: ${errMsg}`, 'error');
    } finally {
      setSmsSending(false);
    }
  };

  // ━━━ WhatsApp Dynamic Chat ━━━
  const sendWaMessage = async (text = waInput) => {
    if (!text.trim()) return;
    const userMsg = text.trim();
    setWaMessages(prev => [...prev, { sender: 'user', text: userMsg, time: getTime() }]);
    setWaInput('');
    setWaTyping(true);

    try {
      const res = await axios.post(`${API_URL}/api/chat`, {
        message: userMsg,
        lang_code: waLang,
        context: lastAnalysis
      });

      // Simulate a small delay for realism
      await new Promise(resolve => setTimeout(resolve, 600));

      if (res.data && res.data.success) {
        const { response } = res.data.data;
        setWaMessages(prev => [...prev, { sender: 'bot', text: response || '...', time: getTime() }]);
      } else {
        setWaMessages(prev => [...prev, { sender: 'bot', text: tWa.bot_default, time: getTime() }]);
      }
    } catch (err) {
      console.error('[WA Chat Error]:', err);
      setWaMessages(prev => [...prev, { sender: 'bot', text: '⚠️ Connection failed. Try again.', time: getTime() }]);
    } finally {
      setWaTyping(false);
    }
  };

  const handleWaVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    try {
      const recognition = new SpeechRecognition();
      const localeMap = { en:'en-IN', hi:'hi-IN', mr:'mr-IN', ta:'ta-IN', te:'te-IN', bn:'bn-IN', gu:'gu-IN', kn:'kn-IN', pa:'pa-IN' };
      recognition.lang = localeMap[waLang] || 'en-IN';
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        sendWaMessage(transcript);
      };
      recognition.start();
    } catch(err) { console.error('Mic error', err); }
  };

  const toastColors = {
    success: '#10B981',
    error: '#EF4444',
  };

  const quickBtns = [
    { label: tWa.quick_soil, icon: '🌱' },
    { label: tWa.quick_crop, icon: '🌾' },
    { label: tWa.quick_water, icon: '💧' },
  ];

  return (
    <div className="farm-page">
      <PageHeader
        kicker={t.nav_sms}
        title={t.comm_title}
        lede={t.comm_subtitle}
        tools={(
          <button type="button" className="farm-ghost-btn" onClick={() => setOffline(!offline)}>
            <WifiOff size={16} /> {offline ? t.comm_offline_active : t.comm_simulate_offline}
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2rem' }}>
        
        {/* ━━━ REAL SMS PANEL ━━━ */}
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="glass"
          style={{ padding: '2rem', position: 'relative', overflow: 'hidden' }}
        >
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)', padding: '0.6rem', borderRadius: '0.6rem', color: 'white' }}>
              <Smartphone size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>{t.comm_sms_title}</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{t.comm_sms_via}</p>
            </div>
          </div>
          
          <form onSubmit={handleSendSMS} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>📱 {t.comm_phone}</label>
              <input 
                id="comm-phone-input"
                type="tel" value={phone} onChange={e => setPhone(e.target.value)} 
                placeholder={t.comm_phone_eg || t.phone_placeholder} required 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.6rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', outline: 'none', fontSize: '0.9rem', transition: 'all 0.3s' }} 
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>💬 {t.comm_message}</label>
                <button type="button" onClick={handleUseLastAnalysis} style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '1.5rem', padding: '0.3rem 0.75rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Zap size={12} /> {t.comm_use_analysis}
                </button>
              </div>
              <textarea 
                value={smsMessage} onChange={e => setSmsMessage(e.target.value)}
                placeholder={t.comm_msg_ph}
                rows={5}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.6rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', outline: 'none', fontSize: '0.85rem', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }}
              />
            </div>

            {smsMessage && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ background: 'rgba(59,130,246,0.06)', padding: '0.75rem', borderRadius: '0.6rem', borderLeft: '3px solid #3B82F6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <FileText size={12} color="#3B82F6" />
                  <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 800, color: '#64748B', letterSpacing: '0.5px' }}>{t.comm_sms_preview}</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-line', margin: 0 }}>{smsMessage}</p>
              </motion.div>
            )}

            <button type="submit" disabled={smsSending} className="btn-primary" style={{ width: '100%', background: smsSending ? '#64748B' : 'linear-gradient(135deg, #3B82F6, #1D4ED8)', boxShadow: smsSending ? 'none' : '0 4px 15px rgba(59,130,246,0.3)', opacity: smsSending ? 0.7 : 1 }}>
              {smsSending ? (
                <><span className="animate-spin" style={{ display: 'inline-block' }}>⏳</span> {t.comm_sending}</>
              ) : (
                <><Send size={16} /> {t.comm_send_sms}</>
              )}
            </button>
          </form>
          
          <AnimatePresence>
            {toast && (
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} style={{ position: 'absolute', bottom: '1rem', left: '1rem', right: '1rem', background: toastColors[toastType], color: 'white', padding: '0.8rem 1rem', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '0.82rem', boxShadow: `0 4px 12px ${toastColors[toastType]}40` }}>
                {toastType === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ━━━ WHATSAPP SIMULATOR (DYNAMIC) ━━━ */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} style={{ display: 'flex', flexDirection: 'column', height: '550px', position: 'relative', overflow: 'hidden', borderRadius: '16px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }}>
          
          {offline && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.92)', zIndex: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem', textAlign: 'center', backdropFilter: 'blur(8px)' }}>
              <ShieldAlert size={48} color="#EF4444" style={{ marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.25rem', color: 'white', marginBottom: '0.5rem', fontWeight: 800 }}>{t.comm_offline_title}</h3>
              <p style={{ color: '#94A3B8' }}>{t.comm_offline_desc}</p>
            </div>
          )}

          {/* WhatsApp Header */}
          <div style={{ background: '#075E54', color: 'white', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ width: '38px', height: '38px', background: '#25D366', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sprout size={20} color="white" /></div>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{tWa.whatsapp_title}</h3>
                <p style={{ fontSize: '0.7rem', opacity: 0.85, margin: 0 }}>{waTyping ? '⌨️ typing...' : '🟢 online'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(255,255,255,0.15)', padding: '0.25rem 0.5rem', borderRadius: '1rem' }}>
              <Globe size={14} />
              <select value={waLang} onChange={(e) => setWaLang(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 'bold', outline: 'none', cursor: 'pointer', maxWidth: '70px', fontSize: '0.8rem' }}>
                <option value="en" style={{color:'black'}}>EN</option>
                <option value="hi" style={{color:'black'}}>हिंदी</option>
                <option value="mr" style={{color:'black'}}>मराठी</option>
                <option value="bn" style={{color:'black'}}>বাংলা</option>
                <option value="te" style={{color:'black'}}>తెలుగు</option>
                <option value="ta" style={{color:'black'}}>தமிழ்</option>
                <option value="gu" style={{color:'black'}}>ગુજરાતી</option>
                <option value="kn" style={{color:'black'}}>ಕನ್ನಡ</option>
                <option value="pa" style={{color:'black'}}>ਪੰਜਾਬੀ</option>
              </select>
            </div>
          </div>

          {/* Chat Messages Area */}
          <div style={{ flex: 1, padding: '0.75rem 0.6rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1.5\' fill=\'%23c8c3b8\' opacity=\'0.3\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect fill=\'%23ECE5DD\' width=\'200\' height=\'200\'/%3E%3Crect fill=\'url(%23p)\' width=\'200\' height=\'200\'/%3E%3C/svg%3E")', backgroundSize: '200px' }}>
            
            {/* Date Chip */}
            <div style={{ alignSelf: 'center', background: 'rgba(225,219,208,0.9)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.7rem', color: '#54656F', fontWeight: 600, marginBottom: '6px', boxShadow: '0 1px 1px rgba(0,0,0,0.06)' }}>
              TODAY
            </div>

            {waMessages.map((m, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2 }}
                style={{
                  alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  marginBottom: '2px',
                }}
              >
                <div style={{
                  background: m.sender === 'user' ? '#DCF8C6' : '#FFFFFF',
                  padding: '6px 8px 4px 8px',
                  borderRadius: m.sender === 'user' ? '8px 0 8px 8px' : '0 8px 8px 8px',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
                  position: 'relative',
                }}>
                  <p style={{ fontSize: '0.85rem', color: '#111827', lineHeight: 1.45, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                    <span style={{ fontSize: '0.62rem', color: '#8696A0' }}>{m.time}</span>
                    {m.sender === 'user' && <CheckCheck size={13} color="#53BDEB" />}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Typing Indicator */}
            {waTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ alignSelf: 'flex-start', background: '#FFFFFF', padding: '10px 16px', borderRadius: '0 8px 8px 8px', boxShadow: '0 1px 1px rgba(0,0,0,0.08)', display: 'flex', gap: '4px', alignItems: 'center' }}
              >
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 7, height: 7, borderRadius: '50%', background: '#8696A0',
                    animation: `waBounce 1.4s ${i * 0.15}s ease-in-out infinite`,
                  }} />
                ))}
                <style>{`@keyframes waBounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }`}</style>
              </motion.div>
            )}
            <div ref={waEndRef} />
          </div>

          {/* Quick Reply Buttons */}
          <div style={{ padding: '6px 10px', background: '#F0F0F0', display: 'flex', gap: '6px', overflowX: 'auto', flexShrink: 0, borderTop: '1px solid #E0DAD1' }}>
            {quickBtns.map((q, i) => (
              <button
                key={i}
                onClick={() => sendWaMessage(q.label)}
                style={{
                  background: '#FFFFFF', border: '1px solid #25D366', borderRadius: '20px', padding: '5px 12px',
                  fontSize: '0.72rem', fontWeight: 600, color: '#075E54', cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.target.style.background = '#DCF8C6'; }}
                onMouseLeave={e => { e.target.style.background = '#FFFFFF'; }}
              >
                {q.icon} {q.label}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div style={{ background: '#F0F0F0', padding: '6px 8px', display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={handleWaVoice}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#54656F', padding: '6px', display: 'flex', borderRadius: '50%' }}
              title="Voice input"
            >
              <Mic size={20} />
            </button>
            <input
              type="text"
              value={waInput}
              onChange={(e) => setWaInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendWaMessage()}
              placeholder={tWa.chat_placeholder}
              style={{
                flex: 1, background: '#FFFFFF', padding: '9px 14px', borderRadius: '24px', border: 'none',
                outline: 'none', color: '#111827', fontSize: '0.88rem', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={() => sendWaMessage()}
              disabled={waTyping}
              style={{
                width: '38px', height: '38px', borderRadius: '50%', border: 'none',
                background: waInput.trim() ? '#25D366' : '#128C7E',
                color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Communication;
