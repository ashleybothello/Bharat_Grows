import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Mic, Volume2, Send, Globe, MicOff, Sparkles } from 'lucide-react';
import axios from 'axios';
import { translations } from '../utils/i18n';

const AIChatbot = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [lang, setLang] = useState('en');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [latestData, setLatestData] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [micError, setMicError] = useState('');
  const messagesEndRef = useRef(null);

  const t = translations[lang] || translations['en'];

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL || 'https://krishimitra-backend-wrc0.onrender.com'}/history`);
        if (res.data && res.data.length > 0) setLatestData(res.data[0]);
      } catch (err) { }
    };
    fetchLatest();
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{ sender: 'bot', text: t.greeting }]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setMessages(prev => {
        if (prev.length > 0 && prev[0].sender === 'bot') {
          const updated = [...prev];
          updated[0] = { ...updated[0], text: t.greeting };
          return updated;
        }
        return prev;
      });
    }
  }, [lang]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);


  const handleSend = async (text = input) => {
    if (!text.trim()) return;
    const userMsg = text.trim();
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);
    setMicError('');

    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL || 'https://krishimitra-backend-wrc0.onrender.com'}/api/chat`, {
        message: userMsg,
        lang_code: lang,
        context: latestData
      });

      if (res.data && res.data.success) {
        const { response, action } = res.data.data;
        setMessages(prev => [...prev, { sender: 'bot', text: response || '...' }]);
        
        // Navigation and Custom Action Handler
        setTimeout(() => {
          if (action.startsWith('fill_phone:')) {
            const num = action.split(':')[1]?.replace(/\s/g, '') || '';
            if (num) window.dispatchEvent(new CustomEvent('fill_phone', { detail: num }));
          } else if (action === 'navigate_logout') {
            if (window.confirm("Are you sure you want to log out?")) {
              localStorage.removeItem('soilai_farmer');
              navigate('/login', { replace: true });
            }
          } else if (action.startsWith('send_sms:')) {
            const num = action.split(':')[1]?.replace(/\s/g, '') || '';
            navigate('/app/communication');
            // Dispatch after a short delay to let the page mount
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('send_sms', { detail: num }));
            }, 600);
          } else if (action === 'navigate_analyze') {
            navigate('/app/analyze');
          } else if (action === 'navigate_results') {
            navigate('/app/results');
          } else if (action === 'navigate_history') {
            navigate('/app/history');
          } else if (action === 'navigate_insights') {
            navigate('/app/insights');
          } else if (action === 'navigate_communication') {
            navigate('/app/communication');
          }
        }, 800); // Slight delay for better UX
      } else {
        setMessages(prev => [...prev, { sender: 'bot', text: t.bot_default }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Connection to SAATHI failed.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSpeechOutput = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(text);
      const localeMap = { 'en':'en-IN','hi':'hi-IN','mr':'mr-IN','ta':'ta-IN','te':'te-IN','bn':'bn-IN','gu':'gu-IN','kn':'kn-IN','pa':'pa-IN' };
      msg.lang = localeMap[lang] || 'en-IN';
      const voices = window.speechSynthesis.getVoices();
      const localVoice = voices.find(v => v.lang === msg.lang);
      if (localVoice) msg.voice = localVoice;
      window.speechSynthesis.speak(msg);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setMicError("Mic unsupported"); return; }
    try {
      const recognition = new SpeechRecognition();
      const localeMap = { 'en':'en-IN','hi':'hi-IN','mr':'mr-IN','ta':'ta-IN','te':'te-IN','bn':'bn-IN','gu':'gu-IN','kn':'kn-IN','pa':'pa-IN' };
      recognition.lang = localeMap[lang] || 'en-IN';
      recognition.onstart = () => setMicError('🎤 Listening...');
      recognition.onerror = (e) => setMicError(`Error: ${e.error}`);
      recognition.onend = () => setTimeout(() => setMicError(''), 2000);
      recognition.onresult = (event) => {
        setMicError('');
        handleSend(event.results[0][0].transcript);
      };
      recognition.start();
    } catch(err) { setMicError("Permission denied"); }
  };

  const styles = {
    wrapper: {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '12px',
    },
    chatWindow: {
      width: '360px',
      maxHeight: 'calc(100vh - 120px)',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: '16px',
      overflow: 'hidden',
      background: '#FFFFFF',
      border: '1px solid rgba(0,0,0,0.08)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
    },
    header: {
      background: 'var(--primary)',
      padding: '14px 16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    chatArea: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      background: '#F8F5EE',
      minHeight: '250px',
      maxHeight: '320px',
    },
    userBubble: {
      maxWidth: '80%',
      padding: '10px 14px',
      fontSize: '0.88rem',
      lineHeight: 1.5,
      background: 'var(--primary)',
      color: 'white',
      borderRadius: '14px 14px 2px 14px',
      alignSelf: 'flex-end',
    },
    botBubble: {
      maxWidth: '80%',
      padding: '10px 14px',
      fontSize: '0.88rem',
      lineHeight: 1.5,
      background: '#FFFFFF',
      color: 'var(--text-main)',
      borderRadius: '14px 14px 14px 2px',
      border: '1px solid rgba(0,0,0,0.06)',
      alignSelf: 'flex-start',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    },
    quickActions: {
      padding: '8px 12px',
      display: 'flex',
      gap: '6px',
      overflowX: 'auto',
      background: '#FFFFFF',
      borderTop: '1px solid rgba(0,0,0,0.06)',
    },
    quickBtn: {
      background: 'rgba(46,125,50,0.08)',
      color: 'var(--primary)',
      border: '1px solid rgba(46,125,50,0.15)',
      borderRadius: '20px',
      padding: '5px 12px',
      fontSize: '0.72rem',
      fontWeight: 700,
      cursor: 'pointer',
      flexShrink: 0,
      whiteSpace: 'nowrap',
      transition: 'all 0.2s',
      fontFamily: 'inherit',
    },
    inputArea: {
      padding: '10px 12px',
      background: '#FFFFFF',
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      borderTop: '1px solid rgba(0,0,0,0.06)',
    },
    fab: {
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      background: 'var(--primary)',
      color: 'white',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 16px rgba(46,125,50,0.35)',
    },
  };

  return (
    <div style={styles.wrapper}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            style={styles.chatWindow}
          >
            {/* Header */}
            <div style={styles.header}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={18} color="white" />
                </div>
                <div>
                  <h3 style={{ color: 'white', fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>SAATHI</h3>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', margin: 0, fontWeight: 600 }}>● Active</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 700, fontSize: '0.75rem', padding: '4px 6px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <option value="en" style={{color:'#333'}}>EN</option>
                  <option value="hi" style={{color:'#333'}}>हिं</option>
                  <option value="mr" style={{color:'#333'}}>मरा</option>
                  <option value="bn" style={{color:'#333'}}>বাং</option>
                  <option value="te" style={{color:'#333'}}>తె</option>
                  <option value="ta" style={{color:'#333'}}>த</option>
                  <option value="gu" style={{color:'#333'}}>ગુ</option>
                  <option value="kn" style={{color:'#333'}}>ಕ</option>
                  <option value="pa" style={{color:'#333'}}>ਪੰ</option>
                </select>
                <button onClick={() => setIsOpen(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex' }}><X size={16} /></button>
              </div>
            </div>

            {/* Chat Area */}
            <div style={styles.chatArea}>
              {messages.map((m, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={m.sender === 'user' ? styles.userBubble : styles.botBubble}>
                    {m.text}
                  </div>
                  {m.sender === 'bot' && (
                    <button onClick={() => handleSpeechOutput(m.text)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', marginTop: '4px', padding: '2px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem' }}>
                      <Volume2 size={12} /> Listen
                    </button>
                  )}
                </div>
              ))}

              {isTyping && (
                <div style={{ ...styles.botBubble, display: 'flex', gap: '5px', padding: '12px 18px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', animation: 'float 1s ease-in-out infinite' }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', animation: 'float 1s 0.2s ease-in-out infinite' }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', animation: 'float 1s 0.4s ease-in-out infinite' }} />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            <div style={styles.quickActions}>
              {[t.quick_soil, t.quick_crop, t.quick_water].map((q, i) => (
                <button key={i} onClick={() => handleSend(q)} style={styles.quickBtn}>{q}</button>
              ))}
            </div>

            {/* Input Area */}
            <div style={styles.inputArea}>
              {micError && (
                <div style={{ position: 'absolute', bottom: '60px', left: '12px', right: '12px', fontSize: '0.7rem', color: micError.includes('Listen') ? '#10B981' : '#EF4444', background: micError.includes('Listen') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center' }}>{micError}</div>
              )}
              <button onClick={handleVoiceInput} style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px', borderRadius: '10px', display: 'flex' }}>
                {micError === 'Mic unsupported' ? <MicOff size={18}/> : <Mic size={18} />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={t.chat_placeholder}
                style={{ flex: 1, border: '1px solid rgba(0,0,0,0.08)', background: '#F8F5EE', padding: '10px 14px', borderRadius: '12px', outline: 'none', color: 'var(--text-main)', fontSize: '0.88rem', fontFamily: 'inherit' }}
              />
              <button onClick={() => handleSend()} style={{ background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer', padding: '10px', borderRadius: '12px', display: 'flex' }}>
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        style={styles.fab}
      >
        {isOpen ? <X size={24} /> : <Bot size={24} />}
      </motion.button>
    </div>
  );
};

export default AIChatbot;
