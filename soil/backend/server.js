const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const { pool, initDB } = require('./db');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const otpAuth = require('./otpAuth');
const marketService = require('./services/market/marketService');
const ml = require('./routes/ml');
const telemetry = require('./routes/telemetry');
const hardware = require('./routes/hardware');
const simulationEngine = require('./services/telemetry/simulationEngine');
const espIngest = require('./services/telemetry/espIngest');
const saathiContext = require('./services/saathi/farmContext');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'BharatGrow API is running',
  });
});

// Initialize Database
initDB();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

app.post('/predict', async (req, res) => {
  try {
    const { n, p, k, ph, moisture, temperature, humidity, rainfall } = req.body;

    // Every reading must be supplied. Moisture and rainfall were previously
    // filled with Math.random() when absent, which fed invented values into the
    // model and into the farmer's history. Missing input is now an error.
    const readings = { n, p, k, ph, moisture, temperature, humidity, rainfall };
    const missing = Object.entries(readings)
      .filter(([, value]) => value === undefined || value === null || value === '' || !Number.isFinite(Number(value)))
      .map(([key]) => key);

    if (missing.length) {
      return res.status(400).json({
        code: 'INVALID_INPUT',
        error: `Missing or non-numeric required field(s): ${missing.join(', ')}`,
      });
    }

    const finalMoisture = Number(moisture);
    const finalRainfall = Number(rainfall);

    // 1. Call the ML service first, so a database problem can never be reported
    //    as a model failure and can never discard a valid prediction.
    const mlPayload = {
      n, p, k, ph, moisture: finalMoisture, temperature, humidity, rainfall: finalRainfall
    };

    let mlResponse;
    try {
      mlResponse = await axios.post(`${ML_SERVICE_URL}/api/predict`, mlPayload, {
        timeout: Number(process.env.ML_SERVICE_TIMEOUT_MS || 20000),
      });
    } catch (mlError) {
      console.error('[predict] ML service error:', mlError.response?.data || mlError.message);

      if (mlError.response?.status === 422) {
        return res.status(422).json({
          code: 'ML_INVALID_INPUT',
          error: 'The ML service rejected these readings.',
        });
      }
      if (!mlError.response) {
        const timedOut = mlError.code === 'ECONNABORTED' || mlError.code === 'ETIMEDOUT';
        return res.status(503).json({
          code: timedOut ? 'ML_SERVICE_TIMEOUT' : 'ML_SERVICE_UNAVAILABLE',
          error: timedOut
            ? 'The ML service did not respond in time.'
            : `The ML service is not reachable at ${ML_SERVICE_URL}.`,
        });
      }
      return res.status(502).json({
        code: 'ML_SERVICE_ERROR',
        error: 'The ML service could not complete this prediction.',
      });
    }

    const { soil_quality, recommended_crops, improvement_tips, prediction_confidence, crop_confidences, model_accuracy } = mlResponse.data;

    // 2. Persist the reading and prediction. Best-effort: history is valuable but
    //    it must not cost the farmer a result they are waiting on.
    let saved = false;
    let saveError = null;
    try {
      const soilResult = await pool.query(
        `INSERT INTO soil_data (n, p, k, ph, moisture, temperature, humidity, rainfall)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id;`,
        [n, p, k, ph, finalMoisture, temperature, humidity, finalRainfall]
      );

      await pool.query(
        `INSERT INTO predictions (soil_id, soil_quality, recommended_crops, improvement_tips)
         VALUES ($1, $2, $3, $4);`,
        [
          soilResult.rows[0].id,
          soil_quality,
          JSON.stringify(recommended_crops),
          JSON.stringify(improvement_tips),
        ]
      );
      saved = true;
    } catch (dbError) {
      console.error('[predict] persistence failed:', dbError.message);
      saveError = 'Prediction succeeded but could not be saved to history.';
    }

    // 3. Return the real model output, unchanged in shape.
    res.json({
      soil_quality,
      recommended_crops,
      improvement_tips,
      prediction_confidence,
      crop_confidences,
      model_accuracy,
      saved,
      ...(saveError ? { save_error: saveError } : {}),
    });

  } catch (error) {
    console.error("Error during prediction:", error.response?.data || error.message);
    res.status(500).json({ code: 'PREDICTION_FAILED', error: 'Failed to process prediction.' });
  }
});

// ━━━━━━━━━━━━━━━ ML SERVICE (crop model + rainfall intelligence + decision engine) ━━━━━━━━━━━━━━━
app.use('/api/ml', ml.router);
app.post('/api/ml/crop-decision', ml.createCropDecisionHandler(pool));

// ━━━━━━━━━━━━━━━ SENSOR TELEMETRY (simulated IoT nodes) ━━━━━━━━━━━━━━━
// Nodes, readings, graph series, anomalies and simulation control. Every route
// is scoped to the authenticated farmer inside routes/telemetry.js.
// Sensor telemetry lives under these prefixes only. Mounting the router on
// all of `/api` previously ran farmer-auth on OTP, market, ML and chat.
const telemetryPrefix = /^\/(nodes|telemetry|anomalies|simulation)(\/|$)/;
app.use('/api', (req, res, next) => {
  if (telemetryPrefix.test(req.path)) return telemetry.router(req, res, next);
  return next();
});

// Physical ESP32 Hardware Beta — public live read, separate from simulated nodes.
app.use('/api/hardware', hardware.router);

// REAL SMS — Fast2SMS API (No simulation)
app.post('/api/send-sms', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Phone and message are required.' });
    }

    // Strip +91 or leading 0 — Fast2SMS needs raw 10-digit numbers
    const cleanNumber = phone.replace(/^\+?91/, '').replace(/^0/, '').trim();
    
    if (cleanNumber.length !== 10 || !/^\d+$/.test(cleanNumber)) {
      return res.status(400).json({ success: false, error: 'Enter a valid 10-digit Indian mobile number.' });
    }

    const apiKey = process.env.FAST2SMS_API_KEY;
    
    if (!apiKey) {
      console.error('[SMS FATAL] FAST2SMS_API_KEY not set in .env');
      return res.status(500).json({ success: false, error: 'SMS API key not configured on server.' });
    }

    console.log(`[SMS] Sending to: ${cleanNumber} | Message: ${message.substring(0, 50)}...`);

    const smsResponse = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: {
        authorization: apiKey,
        route: 'q',
        message: message,
        language: 'english',
        flash: 0,
        numbers: cleanNumber,
      },
      headers: {
        authorization: apiKey,
        'cache-control': 'no-cache',
      }
    });

    console.log('[SMS RESPONSE]:', JSON.stringify(smsResponse.data));

    if (smsResponse.data && smsResponse.data.return === true) {
      return res.json({ 
        success: true, 
        request_id: smsResponse.data.request_id,
        message: smsResponse.data.message?.[0] || 'SMS sent successfully',
      });
    } else {
      console.error('[SMS FAIL]:', smsResponse.data);
      return res.status(400).json({ 
        success: false, 
        error: smsResponse.data?.message || 'Fast2SMS rejected the request',
      });
    }

  } catch(error) {
    const errDetail = error.response?.data || error.message;
    console.error('[SMS ERROR]:', errDetail);
    return res.status(500).json({ 
      success: false, 
      error: typeof errDetail === 'string' ? errDetail : (errDetail?.message || 'Failed to send SMS. Check server logs.'),
    });
  }
});

app.get('/metrics', async (req, res) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/api/metrics`);
    // Optionally save to db if not already saved
    // ...
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching metrics:", error.message);
    res.status(500).json({ error: 'Failed to fetch metrics from ML service.' });
  }
});

app.get('/history', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id as prediction_id,
        s.n, s.p, s.k, s.ph, s.moisture, s.temperature, s.humidity, s.rainfall,
        p.soil_quality, p.recommended_crops, p.improvement_tips, p.created_at
      FROM predictions p
      JOIN soil_data s ON p.soil_id = s.id
      ORDER BY p.created_at DESC
      LIMIT 50;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching history:", error.message);
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

// ━━━━━━━━━━━━━━━ OTP AUTHENTICATION ━━━━━━━━━━━━━━━
app.post('/api/auth/send-otp', otpAuth.sendOtp);
app.post('/api/auth/verify-otp', otpAuth.verifyOtp);
app.post('/api/auth/resend-otp', otpAuth.resendOtp);
app.post('/api/auth/register', otpAuth.register);
app.get('/api/auth/me', otpAuth.me);
app.post('/api/auth/alert-email', otpAuth.updateAlertEmail);
app.post('/api/send-otp', otpAuth.sendOtp);
app.post('/api/verify-otp', otpAuth.verifyOtp);

// ━━━━━━━━━━━━━━━ AI CHATBOT ━━━━━━━━━━━━━━━

// Multilingual offline responses for all 9 supported languages
const offlineTranslations = {
  en: {
    greeting: "Namaste! 🙏 I'm SAATHI, BharatGrow's smart agricultural assistant. Ask me about your soil, crops, weather, market prices, or farm sensor data.",
    default_help: 'I can help with your farm nodes, soil, crop recommendations, weather, Government mandi prices, and sensor alerts. Try asking: How is my farm? Which node needs attention? What should I grow?',
    soil_with_data: (ctx) => `Your latest soil quality is "${ctx.soil_quality}". Nitrogen: ${ctx.n} mg/kg, Phosphorus: ${ctx.p} mg/kg, Potassium: ${ctx.k} mg/kg, pH: ${ctx.ph}.`,
    soil_no_data: 'I do not have a soil analysis yet. Open Analyze to run one, or ask about your live farm nodes if telemetry is streaming.',
    crop_with_data: (crops) => `The crop model currently recommends: ${crops.join(', ')}. This is an ML prediction from your latest Analyze run — not a guarantee.`,
    crop_no_data: 'Run a soil analysis to get personalized crop recommendations for your field!',
    water: 'Water your fields during early morning (5-7 AM) to reduce evaporation losses. For most crops, maintain a 2-3 day irrigation cycle based on soil moisture levels. Drip irrigation saves up to 60% water!',
    fertilizer: 'Fertilizer tips: Apply Urea for nitrogen deficiency, DAP for phosphorus, and MOP for potassium. Always do a soil test before applying fertilizers. Excess fertilizer can damage crops!',
    history: 'Let me take you to your analysis history page!',
    analyze: 'Let me take you to the soil analysis page!',
    insights: 'Let me show you the AI insights and charts!',
    sms_sent: (num) => `Sending SMS with your soil report to ${num}!`,
    sms_page: 'Let me take you to the communication page to send SMS alerts!',
  },
  hi: {
    greeting: 'नमस्ते! 🙏 मैं साथी हूँ, BharatGrow का स्मार्ट कृषि सहायक। मिट्टी, फसल, मौसम, मंडी भाव या फार्म सेंसर डेटा के बारे में पूछें।',
    default_help: 'मैं आपके खेत के नोड, मिट्टी, फसल सुझाव, मौसम, सरकारी मंडी भाव और सेंसर चेतावनियों में मदद कर सकता हूँ। पूछें: मेरा खेत कैसा है? किस नोड पर ध्यान चाहिए?',
    soil_with_data: (ctx) => `आपकी मिट्टी की गुणवत्ता "${ctx.soil_quality}" है। नाइट्रोजन: ${ctx.n} mg/kg, फॉस्फोरस: ${ctx.p} mg/kg, पोटैशियम: ${ctx.k} mg/kg, pH: ${ctx.ph}।`,
    soil_no_data: 'अभी मिट्टी विश्लेषण उपलब्ध नहीं है। Analyze खोलें, या यदि नोड रीडिंग चल रही हैं तो उनके बारे में पूछें।',
    crop_with_data: (crops) => `फसल मॉडल अभी सुझाता है: ${crops.join(', ')}। यह आपके पिछले Analyze रन का ML अनुमान है — गारंटी नहीं।`,
    crop_no_data: 'अपने खेत के लिए फसल सुझाव पाने के लिए मिट्टी की जाँच करें!',
    water: 'सुबह जल्दी (5-7 बजे) सिंचाई करें ताकि वाष्पीकरण कम हो। ज़्यादातर फसलों के लिए 2-3 दिन का सिंचाई चक्र रखें। ड्रिप सिंचाई से 60% पानी बचता है!',
    fertilizer: 'खाद सुझाव: नाइट्रोजन की कमी के लिए यूरिया, फॉस्फोरस के लिए DAP, और पोटैशियम के लिए MOP डालें। खाद डालने से पहले हमेशा मिट्टी जाँच करें!',
    history: 'चलिए आपके पुराने विश्लेषण देखते हैं!',
    analyze: 'चलिए मिट्टी विश्लेषण पेज पर चलते हैं!',
    insights: 'चलिए AI इनसाइट्स और चार्ट्स देखते हैं!',
    sms_sent: (num) => `${num} पर मिट्टी रिपोर्ट SMS भेज रहे हैं!`,
    sms_page: 'SMS भेजने के लिए संचार पेज पर चलते हैं!',
  },
  mr: {
    greeting: 'नमस्कार! 🙏 मी साथी आहे, BharatGrow चा स्मार्ट कृषी सहाय्यक. माती, पिके, हवामान, मंडी भाव किंवा शेत सेन्सर डेटा विचारा.',
    default_help: 'मी तुमच्या शेतातील नोड, माती, पीक सुचवणी, हवामान, शासकीय मंडी भाव आणि सेन्सर इशारे समजावून सांगू शकतो. विचारा: माझे शेत कसे आहे?',
    soil_with_data: (ctx) => `तुमच्या मातीची गुणवत्ता "${ctx.soil_quality}" आहे. नायट्रोजन: ${ctx.n} mg/kg, फॉस्फरस: ${ctx.p} mg/kg, पोटॅशियम: ${ctx.k} mg/kg, pH: ${ctx.ph}.`,
    soil_no_data: 'अद्याप माती विश्लेषण नाही. Analyze उघडा, किंवा नोड रीडिंग चालू असतील तर त्याबद्दल विचारा.',
    crop_with_data: (crops) => `पीक मॉडेल सध्या सुचवते: ${crops.join(', ')}. हे तुमच्या शेवटच्या Analyze चा ML अंदाज आहे — हमी नाही.`,
    crop_no_data: 'पीक सुचवणी मिळवण्यासाठी मातीची तपासणी करा!',
    water: 'सकाळी लवकर (5-7 वाजता) सिंचन करा म्हणजे बाष्पीभवन कमी होईल. बहुतेक पिकांसाठी 2-3 दिवसांचे सिंचन चक्र ठेवा. ठिबक सिंचनाने 60% पाणी वाचते!',
    fertilizer: 'खत सल्ला: नायट्रोजनच्या कमतरतेसाठी युरिया, फॉस्फरससाठी DAP आणि पोटॅशियमसाठी MOP वापरा. खत टाकण्यापूर्वी नेहमी माती तपासा!',
    history: 'चला तुमचा पूर्वीचा विश्लेषण इतिहास पाहू!',
    analyze: 'चला माती विश्लेषण पेजवर जाऊ!',
    insights: 'चला AI इनसाइट्स आणि चार्ट्स पाहू!',
    sms_sent: (num) => `${num} वर माती अहवाल SMS पाठवत आहोत!`,
    sms_page: 'SMS पाठवण्यासाठी संवाद पेजवर जाऊ!',
  },
  ta: {
    greeting: 'வணக்கம்! 🙏 நான் SAATHI, BharatGrow-இன் வேளாண் உதவியாளர். மண், பயிர், வானிலை, மண்டி விலை அல்லது பண்ணை சென்சார் தரவைப் பற்றி கேளுங்கள்.',
    default_help: 'நான் உதவ முடியும்: 🌱 மண் பரிசோதனை, 🌾 பயிர் பரிந்துரை, 💧 நீர்ப்பாசன ஆலோசனை, 🧪 உர குறிப்புகள். இவற்றில் எதையும் கேளுங்கள்!',
    soil_with_data: (ctx) => `உங்கள் மண் தரம் "${ctx.soil_quality}". நைட்ரஜன்: ${ctx.n}, பாஸ்பரஸ்: ${ctx.p}, பொட்டாசியம்: ${ctx.k}, pH: ${ctx.ph}. விரிவான வரைபடங்களுக்கு இன்சைட்ஸ் பக்கம் பாருங்கள்!`,
    soil_no_data: 'முதலில் மண் பரிசோதனை செய்யுங்கள், பிறகு நான் சரியான ஆலோசனை தருவேன்!',
    crop_with_data: (crops) => `The crop model currently recommends: ${crops.join(', ')}. This is an ML prediction from your latest Analyze run.`,
    crop_no_data: 'பயிர் பரிந்துரை பெற மண் பரிசோதனை செய்யுங்கள்!',
    water: 'காலை (5-7 மணி) நீர்ப்பாசனம் செய்யுங்கள். 2-3 நாள் இடைவெளியில் நீர் பாய்ச்சுங்கள். சொட்டு நீர்ப்பாசனம் 60% நீர் சேமிக்கும்!',
    fertilizer: 'உர குறிப்புகள்: நைட்ரஜன் குறைபாட்டிற்கு யூரியா, பாஸ்பரஸுக்கு DAP, பொட்டாசியத்திற்கு MOP பயன்படுத்துங்கள். உரம் இடும் முன் மண் பரிசோதனை செய்யுங்கள்!',
    history: 'உங்கள் முந்தைய பரிசோதனை வரலாற்றைப் பார்ப்போம்!',
    analyze: 'மண் பரிசோதனை பக்கத்திற்கு செல்வோம்!',
    insights: 'AI இன்சைட்ஸ் மற்றும் வரைபடங்களைப் பார்ப்போம்!',
    sms_sent: (num) => `${num} க்கு மண் அறிக்கை SMS அனுப்புகிறோம்!`,
    sms_page: 'SMS அனுப்ப தகவல் தொடர்பு பக்கத்திற்கு செல்வோம்!',
  },
  te: {
    greeting: 'నమస్కారం! 🙏 నేను SAATHI, BharatGrow వ్యవసాయ సహాయకుడ్ని. నేల, పంటలు, వాతావరణం, మండీ ధరలు లేదా ఫార్మ్ సెన్సార్ డేటా గురించి అడగండి.',
    default_help: 'నేను సహాయం చేయగలను: 🌱 నేల పరీక్ష, 🌾 పంట సిఫారసులు, 💧 సాగునీటి సలహా, 🧪 ఎరువుల చిట్కాలు. వీటిలో ఏదైనా అడగండి!',
    soil_with_data: (ctx) => `మీ నేల నాణ్యత "${ctx.soil_quality}". నైట్రోజన్: ${ctx.n}, ఫాస్ఫరస్: ${ctx.p}, పొటాషియం: ${ctx.k}, pH: ${ctx.ph}. వివరమైన చార్ట్‌ల కోసం ఇన్‌సైట్స్ పేజీ చూడండి!`,
    soil_no_data: 'ముందుగా నేల పరీక్ష చేయండి, తర్వాత నేను సరైన సలహా ఇస్తాను!',
    crop_with_data: (crops) => `The crop model currently recommends: ${crops.join(', ')}. This is an ML prediction from your latest Analyze run.`,
    crop_no_data: 'పంట సిఫారసులు పొందడానికి నేల పరీక్ష చేయండి!',
    water: 'ఉదయం (5-7 గంటలు) నీటి తడి ఇవ్వండి. 2-3 రోజుల విరామంతో నీరు పెట్టండి. బిందు సేద్యం 60% నీటిని ఆదా చేస్తుంది!',
    fertilizer: 'ఎరువు చిట్కాలు: నైట్రోజన్ లోపానికి యూరియా, ఫాస్ఫరస్‌కు DAP, పొటాషియంకు MOP వాడండి. ఎరువులు వేయడానికి ముందు నేల పరీక్ష చేయండి!',
    history: 'మీ గత విశ్లేషణ చరిత్ర చూద్దాం!',
    analyze: 'నేల విశ్లేషణ పేజీకి వెళ్దాం!',
    insights: 'AI ఇన్‌సైట్స్ మరియు చార్ట్‌లు చూద్దాం!',
    sms_sent: (num) => `${num} కు నేల నివేదిక SMS పంపుతున్నాం!`,
    sms_page: 'SMS పంపడానికి కమ్యూనికేషన్ పేజీకి వెళ్దాం!',
  },
  bn: {
    greeting: 'নমস্কার! 🙏 আমি SAATHI, BharatGrow-এর কৃষি সহায়ক। মাটি, ফসল, আবহাওয়া, মান্ডি দাম বা ফার্ম সেন্সর তথ্য নিয়ে জিজ্ঞাসা করুন।',
    default_help: 'আমি সাহায্য করতে পারি: 🌱 মাটি পরীক্ষা, 🌾 ফসল সুপারিশ, 💧 সেচ পরামর্শ, 🧪 সার টিপস। এর যেকোনো বিষয়ে জিজ্ঞাসা করুন!',
    soil_with_data: (ctx) => `আপনার মাটির মান "${ctx.soil_quality}"। নাইট্রোজেন: ${ctx.n}, ফসফরাস: ${ctx.p}, পটাশিয়াম: ${ctx.k}, pH: ${ctx.ph}। বিস্তারিত চার্টের জন্য ইনসাইটস পেজ দেখুন!`,
    soil_no_data: 'প্রথমে মাটি পরীক্ষা করুন, তারপর আমি সঠিক পরামর্শ দিতে পারব!',
    crop_with_data: (crops) => `The crop model currently recommends: ${crops.join(', ')}. This is an ML prediction from your latest Analyze run.`,
    crop_no_data: 'ফসল সুপারিশ পেতে মাটি পরীক্ষা করুন!',
    water: 'সকালে (৫-৭টা) সেচ দিন। ২-৩ দিন অন্তর জল দিন। ড্রিপ সেচে ৬০% জল বাঁচে!',
    fertilizer: 'সার টিপস: নাইট্রোজেনের ঘাটতিতে ইউরিয়া, ফসফরাসে DAP, পটাশিয়ামে MOP ব্যবহার করুন। সার দেওয়ার আগে মাটি পরীক্ষা করুন!',
    history: 'আপনার আগের বিশ্লেষণ ইতিহাস দেখা যাক!',
    analyze: 'মাটি বিশ্লেষণ পেজে যাওয়া যাক!',
    insights: 'AI ইনসাইটস ও চার্ট দেখা যাক!',
    sms_sent: (num) => `${num} এ মাটি রিপোর্ট SMS পাঠাচ্ছি!`,
    sms_page: 'SMS পাঠাতে যোগাযোগ পেজে যাওয়া যাক!',
  },
  gu: {
    greeting: 'નમસ્તે! 🙏 હું SAATHI છું, BharatGrowનો કૃષિ સહાયક. માટી, પાક, હવામાન, મંડી ભાવ અથવા ફાર્મ સેન્સર ડેટા વિશે પૂછો.',
    default_help: 'હું મદદ કરી શકું છું: 🌱 માટી પરીક્ષણ, 🌾 પાક ભલામણ, 💧 સિંચાઈ સલાહ, 🧪 ખાતર ટિપ્સ. આમાંથી કંઈપણ પૂછો!',
    soil_with_data: (ctx) => `તમારી માટીની ગુણવત્તા "${ctx.soil_quality}" છે. નાઈટ્રોજન: ${ctx.n}, ફોસ્ફરસ: ${ctx.p}, પોટેશિયમ: ${ctx.k}, pH: ${ctx.ph}. વિગતવાર ચાર્ટ માટે ઇનસાઇટ્સ પેજ જુઓ!`,
    soil_no_data: 'પહેલા માટી પરીક્ષણ કરો, પછી હું યોગ્ય સલાહ આપી શકીશ!',
    crop_with_data: (crops) => `The crop model currently recommends: ${crops.join(', ')}. This is an ML prediction from your latest Analyze run.`,
    crop_no_data: 'પાક ભલામણ મેળવવા માટી પરીક્ષણ કરો!',
    water: 'સવારે (5-7 વાગે) સિંચાઈ કરો. 2-3 દિવસના અંતરે પાણી આપો. ટપક સિંચાઈથી 60% પાણી બચે છે!',
    fertilizer: 'ખાતર ટિપ્સ: નાઈટ્રોજનની ઉણપ માટે યુરિયા, ફોસ્ફરસ માટે DAP, પોટેશિયમ માટે MOP વાપરો. ખાતર નાખતા પહેલા માટી પરીક્ષણ કરો!',
    history: 'ચાલો તમારો અગાઉનો વિશ્લેષણ ઇતિહાસ જોઈએ!',
    analyze: 'ચાલો માટી વિશ્લેષણ પેજ પર જઈએ!',
    insights: 'ચાલો AI ઇનસાઇટ્સ અને ચાર્ટ્સ જોઈએ!',
    sms_sent: (num) => `${num} પર માટી રિપોર્ટ SMS મોકલી રહ્યા છીએ!`,
    sms_page: 'SMS મોકલવા કોમ્યુનિકેશન પેજ પર જઈએ!',
  },
  kn: {
    greeting: 'ನಮಸ್ಕಾರ! 🙏 ನಾನು SAATHI, BharatGrowನ ಕೃಷಿ ಸಹಾಯಕ. ಮಣ್ಣು, ಬೆಳೆ, ಹವಾಮಾನ, ಮಂಡಿ ಬೆಲೆ ಅಥವಾ ಫಾರ್ಮ್ ಸೆನ್ಸಾರ್ ಡೇಟಾ ಬಗ್ಗೆ ಕೇಳಿ.',
    default_help: 'ನಾನು ಸಹಾಯ ಮಾಡಬಲ್ಲೆ: 🌱 ಮಣ್ಣಿನ ಪರೀಕ್ಷೆ, 🌾 ಬೆಳೆ ಶಿಫಾರಸು, 💧 ನೀರಾವರಿ ಸಲಹೆ, 🧪 ಗೊಬ್ಬರ ಸಲಹೆ. ಇವುಗಳಲ್ಲಿ ಯಾವುದಾದರೂ ಕೇಳಿ!',
    soil_with_data: (ctx) => `ನಿಮ್ಮ ಮಣ್ಣಿನ ಗುಣಮಟ್ಟ "${ctx.soil_quality}". ನೈಟ್ರೋಜನ್: ${ctx.n}, ಫಾಸ್ಫರಸ್: ${ctx.p}, ಪೊಟ್ಯಾಸಿಯಮ್: ${ctx.k}, pH: ${ctx.ph}. ವಿವರವಾದ ಚಾರ್ಟ್‌ಗಳಿಗೆ ಇನ್‌ಸೈಟ್ಸ್ ಪುಟ ನೋಡಿ!`,
    soil_no_data: 'ಮೊದಲು ಮಣ್ಣಿನ ಪರೀಕ್ಷೆ ಮಾಡಿ, ನಂತರ ಸರಿಯಾದ ಸಲಹೆ ನೀಡುತ್ತೇನೆ!',
    crop_with_data: (crops) => `The crop model currently recommends: ${crops.join(', ')}. This is an ML prediction from your latest Analyze run.`,
    crop_no_data: 'ಬೆಳೆ ಶಿಫಾರಸು ಪಡೆಯಲು ಮಣ್ಣಿನ ಪರೀಕ್ಷೆ ಮಾಡಿ!',
    water: 'ಬೆಳಿಗ್ಗೆ (5-7 ಗಂಟೆ) ನೀರಾವರಿ ಮಾಡಿ. 2-3 ದಿನಗಳ ಮಧ್ಯಂತರದಲ್ಲಿ ನೀರು ಹಾಕಿ. ಹನಿ ನೀರಾವರಿ 60% ನೀರು ಉಳಿಸುತ್ತದೆ!',
    fertilizer: 'ಗೊಬ್ಬರ ಸಲಹೆ: ನೈಟ್ರೋಜನ್ ಕೊರತೆಗೆ ಯೂರಿಯಾ, ಫಾಸ್ಫರಸ್‌ಗೆ DAP, ಪೊಟ್ಯಾಸಿಯಮ್‌ಗೆ MOP ಬಳಸಿ. ಗೊಬ್ಬರ ಹಾಕುವ ಮೊದಲು ಮಣ್ಣು ಪರೀಕ್ಷಿಸಿ!',
    history: 'ನಿಮ್ಮ ಹಿಂದಿನ ವಿಶ್ಲೇಷಣೆ ಇತಿಹಾಸ ನೋಡೋಣ!',
    analyze: 'ಮಣ್ಣಿನ ವಿಶ್ಲೇಷಣೆ ಪುಟಕ್ಕೆ ಹೋಗೋಣ!',
    insights: 'AI ಇನ್‌ಸೈಟ್ಸ್ ಮತ್ತು ಚಾರ್ಟ್‌ಗಳನ್ನು ನೋಡೋಣ!',
    sms_sent: (num) => `${num} ಗೆ ಮಣ್ಣಿನ ವರದಿ SMS ಕಳುಹಿಸುತ್ತಿದ್ದೇವೆ!`,
    sms_page: 'SMS ಕಳುಹಿಸಲು ಸಂವಹನ ಪುಟಕ್ಕೆ ಹೋಗೋಣ!',
  },
  pa: {
    greeting: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! 🙏 ਮੈਂ SAATHI ਹਾਂ, BharatGrow ਦਾ ਖੇਤੀ ਸਹਾਇਕ। ਮਿੱਟੀ, ਫ਼ਸਲ, ਮੌਸਮ, ਮੰਡੀ ਭਾਅ ਜਾਂ ਫਾਰਮ ਸੈਂਸਰ ਡਾਟਾ ਬਾਰੇ ਪੁੱਛੋ।',
    default_help: 'ਮੈਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ: 🌱 ਮਿੱਟੀ ਜਾਂਚ, 🌾 ਫ਼ਸਲ ਸੁਝਾਅ, 💧 ਸਿੰਚਾਈ ਸਲਾਹ, 🧪 ਖਾਦ ਟਿੱਪਸ। ਇਨ੍ਹਾਂ ਵਿੱਚੋਂ ਕੁਝ ਵੀ ਪੁੱਛੋ!',
    soil_with_data: (ctx) => `ਤੁਹਾਡੀ ਮਿੱਟੀ ਦੀ ਗੁਣਵੱਤਾ "${ctx.soil_quality}" ਹੈ। ਨਾਈਟ੍ਰੋਜਨ: ${ctx.n}, ਫ਼ਾਸਫ਼ੋਰਸ: ${ctx.p}, ਪੋਟਾਸ਼ੀਅਮ: ${ctx.k}, pH: ${ctx.ph}। ਵਿਸਤਾਰ ਨਾਲ ਚਾਰਟ ਲਈ ਇਨਸਾਈਟਸ ਪੇਜ ਵੇਖੋ!`,
    soil_no_data: 'ਪਹਿਲਾਂ ਮਿੱਟੀ ਦੀ ਜਾਂਚ ਕਰੋ, ਫਿਰ ਮੈਂ ਤੁਹਾਨੂੰ ਸਹੀ ਸਲਾਹ ਦੇ ਸਕਾਂਗਾ!',
    crop_with_data: (crops) => `The crop model currently recommends: ${crops.join(', ')}. This is an ML prediction from your latest Analyze run.`,
    crop_no_data: 'ਫ਼ਸਲ ਸੁਝਾਅ ਲੈਣ ਲਈ ਮਿੱਟੀ ਦੀ ਜਾਂਚ ਕਰੋ!',
    water: 'ਸਵੇਰੇ (5-7 ਵਜੇ) ਸਿੰਚਾਈ ਕਰੋ। 2-3 ਦਿਨਾਂ ਦੇ ਅੰਤਰ ਤੇ ਪਾਣੀ ਦਿਓ। ਤੁਪਕਾ ਸਿੰਚਾਈ ਨਾਲ 60% ਪਾਣੀ ਬਚਦਾ ਹੈ!',
    fertilizer: 'ਖਾਦ ਟਿੱਪਸ: ਨਾਈਟ੍ਰੋਜਨ ਦੀ ਘਾਟ ਲਈ ਯੂਰੀਆ, ਫ਼ਾਸਫ਼ੋਰਸ ਲਈ DAP, ਪੋਟਾਸ਼ੀਅਮ ਲਈ MOP ਵਰਤੋ। ਖਾਦ ਪਾਉਣ ਤੋਂ ਪਹਿਲਾਂ ਮਿੱਟੀ ਜਾਂਚ ਕਰੋ!',
    history: 'ਚਲੋ ਤੁਹਾਡਾ ਪੁਰਾਣਾ ਵਿਸ਼ਲੇਸ਼ਣ ਇਤਿਹਾਸ ਵੇਖੀਏ!',
    analyze: 'ਚਲੋ ਮਿੱਟੀ ਵਿਸ਼ਲੇਸ਼ਣ ਪੇਜ ਤੇ ਚੱਲੀਏ!',
    insights: 'ਚਲੋ AI ਇਨਸਾਈਟਸ ਅਤੇ ਚਾਰਟ ਵੇਖੀਏ!',
    sms_sent: (num) => `${num} ਤੇ ਮਿੱਟੀ ਰਿਪੋਰਟ SMS ਭੇਜ ਰਹੇ ਹਾਂ!`,
    sms_page: 'SMS ਭੇਜਣ ਲਈ ਸੰਚਾਰ ਪੇਜ ਤੇ ਚੱਲੀਏ!',
  },
};

function analysisFromContext(context) {
  if (context?.latestAnalysis) return context.latestAnalysis;
  if (!context) return null;
  if (context.soil_quality || context.n != null || context.recommended_crops) {
    return {
      soilQuality: context.soil_quality,
      nitrogen: context.n,
      phosphorus: context.p,
      potassium: context.k,
      ph: context.ph,
      recommendedCrops: Array.isArray(context.recommended_crops)
        ? context.recommended_crops
        : parseMaybeCrops(context.recommended_crops),
    };
  }
  return null;
}

function parseMaybeCrops(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function nodeFromContext(context, message) {
  const nodes = context?.nodes || [];
  const match = String(message || '').match(/node\s*0*(\d+)/i)
    || String(message || '').match(/नोड\s*0*(\d+)/)
    || String(message || '').match(/नोड\s*(\d+)/);
  if (match) {
    const num = Number(match[1]);
    return nodes.find((node) => Number(node.nodeNumber) === num) || context?.selectedNode || null;
  }
  return context?.selectedNode || null;
}

function formatCritical(context) {
  const items = context?.criticalSensors || [];
  if (!items.length) return null;
  return items.slice(0, 6).map((item) => {
    const unit = item.unit ? ` ${item.unit}` : '';
    return `Node ${String(item.nodeNumber).padStart(2, '0')} ${item.label || item.key} ${item.value}${unit} (${item.status || 'CRITICAL'})`;
  }).join('; ');
}

function saathiSystemPrompt(langCode, farmContext) {
  return `You are SAATHI — Smart Agricultural Assistance & Technology Helper Interface — inside BharatGrow (also written Bharat Grows).
You are not ChatGPT, not KrishiMitra, and not a generic assistant. Never introduce yourself as KrishiMitra.

You are the natural-language CONTROL LAYER for the BharatGrow website. The web app itself will perform navigation and UI actions. You must classify the farmer's request and never answer from the wrong data source.

Pages you know:
- Dashboard: farm summary, node overview, alerts
- Analyze: sensor selection, analysis, Crop AI, rainfall intelligence
- Map (/app/iot): hardware nodes, node health, anomalies — NOT the India GIS map
- GIS (/app/gis): India agricultural map, states, districts, soil type layer, crop suitability, satellite basemap
- History: persisted telemetry, node history, time ranges
- Market: crop, state, district, AGMARKNET mandi prices
- Results: last Crop AI + rainfall intelligence output

Context priority — NEVER mix these:
- GIS / "soil type of Maharashtra" / crop suitability of a STATE → GIS dataset only. NEVER quote latestAnalysis nitrogen, phosphorus, potassium, pH, or soilQuality.
- "my soil", "soil N", node sensors → telemetry / Analyze
- wheat/onion price, mandi → Government market data
- "what crop should I grow" without a state → Crop AI (Analyze → Results)
- rain / weather → rainfall intelligence (Open-Meteo + IMD), not GIS
- history / last 7 days → History telemetry
- "open GIS" / "show Maharashtra" → actions, not a speech-only reply

Personality: helpful, farmer-friendly, clear, practical, concise, respectful. Use simple language.
When you quote a reading, include the value and unit. Do not invent numbers.

Data honesty:
- Sensor / node readings are SIMULATED software-demo telemetry unless the context says otherwise.
- Crop recommendations are ML predictions from the existing crop model.
- Rainfall intelligence is rule-based Open-Meteo + IMD baseline — NOT a trained rainfall model.
- Market prices are Government OGD / AGMARKNET. If unavailable, say so. Never guess a price.
- GIS soil is ICAR–NBSS&LUP dominant soil at STATE level, not farm-level and not the Analyze NPK snapshot.

Respond in language code: ${langCode || 'en'}.

If the farmer clearly wants a website action, set actions to the named tools (openGIS, selectGISState, activateGISLayer, openMap, selectNode, openAnalyze, runAnalysis, openHistory, selectHistoryNode, selectHistoryRange, openMarket, showMarketPrice, openDashboard, openProfile, openBeta). Include a state name for GIS selectGISState. Include nodeNumber for node tools. Include commodity + state for market.

Legacy action string still allowed: navigate_analyze, navigate_results, navigate_history, navigate_iot, navigate_market, navigate_gis, fill_phone:<NUMBER>, send_sms:<NUMBER>, none.

Reply with JSON only:
{"response":"<reply>","intent":"<INTENT>","action":"<legacy or none>","actions":[{"type":"<tool>","name":"...","nodeNumber":null,"commodity":null,"state":null,"layer":null}]}

Current UI (lightweight, no secrets):
${JSON.stringify(farmContext?.ui || farmContext?.clientContext?.ui || {}, null, 2)}

Current BharatGrow farm context (compact, no secrets). Use it ONLY for farm/sensor/Crop-AI/market questions — never for GIS state soil type:
${JSON.stringify(farmContext || { available: false }, null, 2)}`;
}

// Offline fallback when Gemini quota is exhausted — now multilingual
function getOfflineResponse(message, context, lang_code) {
  const msg = (message || '').toLowerCase();
  const t = offlineTranslations[lang_code] || offlineTranslations.en;
  const analysis = analysisFromContext(context);
  const node = nodeFromContext(context, message);
  const critical = formatCritical(context);
  let response = '';
  let action = 'none';

  const asksHardware = /sensor|esp32|hardware|real reading|physical/.test(msg)
    || msg.includes('सेंसर') || msg.includes('हार्डवेयर');
  const asksFarm = /how is my farm|farm doing|मेरा खेत|माझे शेत|farm status/.test(msg);
  const asksNode = /node\s*\d+|नोड/.test(msg);
  const asksCritical = /critical|anomaly|alert|गंभीर|क्रिटिकल/.test(msg);
  const asksMarket = /market|mandi|price|भाव|मंडी|बाजार/.test(msg);
  const asksWeather = /weather|temperature|मौसम|हवामान/.test(msg);
  const asksGis = /\bgis\b|soil type|crop suitability|agricultural map|महाराष्ट्र|मध्य प्रदेश/.test(msg)
    && !/my soil|soil n\b|nitrogen|node\s*\d+/.test(msg);

  if (asksGis) {
    response = 'That is a GIS map request, not your Analyze-page soil readings. Open GIS and search the state there. I will not quote farm NPK for a state soil-type question.';
    action = 'navigate_gis';
  } else if (asksHardware) {
    response = 'The current BharatGrow demo is using simulated sensor telemetry. The system is designed so those readings can later be replaced by live ESP32 hardware data.';
  } else if (asksCritical) {
    response = critical
      ? `These sensors are currently CRITICAL: ${critical}. Status comes from BharatGrow's existing sensor classification. Telemetry is simulated demo data.`
      : 'No CRITICAL sensors are in the latest available snapshot.';
  } else if (asksNode && node) {
    const n = node.sensors?.nitrogen;
    const bits = [`Node ${String(node.nodeNumber).padStart(2, '0')} is ${node.health || 'awaiting data'}.`];
    if (n) bits.push(`Nitrogen is ${n.value} ${n.unit} (${n.status}).`);
    if (node.criticalSensors?.length) {
      bits.push(`Critical: ${node.criticalSensors.map((s) => `${s.label} ${s.value} ${s.unit || ''}`.trim()).join(', ')}.`);
    }
    bits.push('These are simulated demo telemetry readings, classified with the existing BharatGrow sensor bands.');
    response = bits.join(' ');
  } else if (asksFarm) {
    const farm = context?.farm;
    if (farm?.nodeCount) {
      response = `Your farm currently has ${farm.nodeCount} nodes. Healthy: ${farm.tally?.GOOD || 0}, needs attention: ${(farm.tally?.AVERAGE || 0) + (farm.tally?.BAD || 0)}, critical: ${farm.tally?.CRITICAL || 0}. ${critical ? `Critical sensors: ${critical}.` : ''} Readings are simulated demo telemetry.`;
    } else {
      response = 'I do not have live node data yet. Sign in and open Map so SAATHI can read your farm snapshot, or run Analyze.';
    }
  } else if (asksMarket) {
    const market = context?.marketSummary;
    if (market?.available && market.crops?.length) {
      const top = market.crops.slice(0, 3).map((row) => `${row.commodity} ${row.modalPrice} ${row.unit || '₹/quintal'} at ${row.market}`).join('; ');
      response = `The latest available Government OGD/AGMARKNET data shows: ${top}.`;
    } else {
      response = 'Current Government mandi data is unavailable. I will not guess a price.';
    }
  } else if (asksWeather) {
    const rain = context?.rainfallPrediction;
    const wx = context?.weather;
    if (rain && (rain.rainfallTodayMm != null || rain.rainfallMm != null)) {
      const today = rain.rainfallTodayMm ?? rain.rainfallMm;
      response = `Rainfall intelligence (Open-Meteo forecast + IMD baseline, not a trained rainfall model): today ${today} mm${rain.rainfallNext24hMm != null ? `, next 24h ${rain.rainfallNext24hMm} mm` : ''}${rain.rainfallNext3DaysMm != null ? `, next 3 days ${rain.rainfallNext3DaysMm} mm` : ''}. ${rain.type || ''}`.trim();
    } else if (wx?.temperatureC != null) {
      response = `The latest farm telemetry temperature is ${wx.temperatureC}°C (${wx.status || 'ungraded'}). This is simulated demo telemetry, not a live weather-station feed.`;
    } else {
      response = 'Rainfall prediction unavailable.';
    }
  } else if (msg.includes('soil') || msg.includes('mitti') || msg.includes('health') || msg.includes('माती') || msg.includes('मिट्टी') || msg.includes('மண்') || msg.includes('మట్టి') || msg.includes('માટી') || msg.includes('ಮಣ್ಣ') || msg.includes('ਮਿੱਟੀ') || msg.includes('মাটি')) {
    if (analysis?.soilQuality) {
      response = t.soil_with_data({
        soil_quality: analysis.soilQuality,
        n: analysis.nitrogen,
        p: analysis.phosphorus,
        k: analysis.potassium,
        ph: analysis.ph,
      });
    } else if (critical) {
      response = `I do not have a completed Analyze run. From live (simulated) nodes: ${critical}.`;
    } else {
      response = t.soil_no_data;
      action = 'navigate_analyze';
    }
  } else if (msg.includes('crop') || msg.includes('fasal') || msg.includes('grow') || msg.includes('recommend') || msg.includes('पीक') || msg.includes('फसल') || msg.includes('பயிர்') || msg.includes('పంట') || msg.includes('પાક') || msg.includes('ಬೆಳೆ') || msg.includes('ਫ਼ਸਲ') || msg.includes('ফসল')) {
    const crops = analysis?.recommendedCrops || context?.cropRecommendation?.crops || [];
    if (crops.length) {
      response = t.crop_with_data(crops);
    } else {
      response = t.crop_no_data;
      action = 'navigate_analyze';
    }
  } else if (msg.includes('water') || msg.includes('irrigation') || msg.includes('pani') || msg.includes('sinchai') || msg.includes('पानी') || msg.includes('सिंचाई') || msg.includes('পানি') || msg.includes('நீர்') || msg.includes('నీరు') || msg.includes('પાણી') || msg.includes('ನೀರು') || msg.includes('ਪਾਣੀ') || msg.includes('সেচ') || msg.includes('सिंचन')) {
    const moisture = node?.sensors?.soil_moisture || context?.nodes?.[0]?.sensors?.soil_moisture;
    if (moisture) {
      response = `Your latest soil moisture reading is ${moisture.value}${moisture.unit ? ` ${moisture.unit}` : ''} (${moisture.status}). This is simulated demo telemetry. ${t.water}`;
    } else {
      response = t.water;
    }
  } else if (msg.includes('fertilizer') || msg.includes('khad') || msg.includes('urea') || msg.includes('खाद') || msg.includes('खत') || msg.includes('உரம்') || msg.includes('ఎరువు') || msg.includes('ખાતર') || msg.includes('ಗೊಬ್ಬರ') || msg.includes('ਖਾਦ') || msg.includes('সার')) {
    response = t.fertilizer;
  } else if (msg.includes('history') || msg.includes('previous') || msg.includes('past') || msg.includes('इतिहास') || msg.includes('पूर्वीचा') || msg.includes('முந்தைய') || msg.includes('ইতিহাস') || msg.includes('చరిత్ర') || msg.includes('ઇતિહાસ') || msg.includes('ಇತಿಹಾಸ') || msg.includes('ਇਤਿਹਾਸ')) {
    response = t.history;
    action = 'navigate_history';
  } else if (msg.includes('analyze') || msg.includes('test') || msg.includes('विश्लेषण') || msg.includes('तपासणी') || msg.includes('பரிசோதனை') || msg.includes('পরীক্ষা') || msg.includes('పరీక్ష') || msg.includes('પરીક્ષણ') || msg.includes('ಪರೀಕ್ಷೆ') || msg.includes('ਜਾਂਚ')) {
    response = t.analyze;
    action = 'navigate_analyze';
  } else if (msg.includes('insight') || msg.includes('chart') || msg.includes('graph') || msg.includes('चार्ट') || msg.includes('ग्राफ') || msg.includes('வரைபடம்') || msg.includes('চার্ট') || msg.includes('చార్ట') || msg.includes('ચાર્ટ') || msg.includes('ಚಾರ್ಟ') || msg.includes('ਚਾਰਟ')) {
    response = t.insights;
    action = 'navigate_insights';
  } else if (msg.includes('sms') || msg.includes('send') || msg.includes('message') || msg.includes('number') || msg.includes('भेज') || msg.includes('पाठव') || msg.includes('அனுப்பு') || msg.includes('পাঠা') || msg.includes('పంపు') || msg.includes('મોકલ') || msg.includes('ಕಳುಹಿಸ') || msg.includes('ਭੇਜ')) {
    const phoneMatch = msg.match(/(\d{10})/);
    if (phoneMatch) {
      response = t.sms_sent(phoneMatch[1]);
      action = `send_sms:${phoneMatch[1]}`;
    } else {
      response = t.sms_page;
    }
  } else if (msg.includes('hello') || msg.includes('hi') || msg.includes('namaste') || msg.includes('hey') || msg.includes('नमस्ते') || msg.includes('नमस्कार') || msg.includes('வணக்கம்') || msg.includes('নমস্কার') || msg.includes('నమస్కారం') || msg.includes('નમસ્તે') || msg.includes('ನಮಸ್ಕಾರ') || msg.includes('ਸਤ')) {
    response = t.greeting;
  } else {
    response = t.default_help;
  }
  return { response, action };
}

app.post('/api/chat', async (req, res) => {
  const { message, lang_code, context } = req.body || {};
  let farmContext = null;
  try {
    const farmer = await saathiContext.farmerFromRequest(req);
    farmContext = await saathiContext.buildFarmContext(farmer, {
      message: message || '',
      clientContext: context,
    });
  } catch (err) {
    console.error('[SAATHI context]', err.message);
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const fallback = getOfflineResponse(message, farmContext || context, lang_code);
      return res.json({ success: true, data: fallback });
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemPrompt = saathiSystemPrompt(lang_code, farmContext);
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        { role: 'user', parts: [{ text: message }] },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text);
    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('[CHAT API ERROR]:', error.message || error);
    const fallback = getOfflineResponse(message || '', farmContext || context, lang_code);
    return res.json({ success: true, data: fallback });
  }
});

// ━━━━━━━━━━━━━━━ HACKATHON ADVISORY PLATFORM ENDPOINTS ━━━━━━━━━━━━━━━

// GET /api/iot/telemetry — formerly invented live values. Hardware Beta is the
// ESP32 path; the main app reads persisted simulated readings from PostgreSQL.
app.get('/api/iot/telemetry', (req, res) => {
  res.status(410).json({
    success: false,
    code: 'TELEMETRY_MOVED',
    error: 'Use GET /api/nodes and GET /api/telemetry/latest. Readings are generated by the backend simulator and stored in PostgreSQL.',
  });
});

// GET /api/satellite/field — GIS Satellite imagery & NDVI vegetation health metadata
app.get('/api/satellite/field', (req, res) => {
  res.json({
    success: true,
    satellite_pass: 'Sentinel-2B / Landsat-9',
    last_updated: '2026-08-20T08:30:00Z',
    cloud_cover: '1.2%',
    field_name: 'GreenValley Agro Estate (Field #402)',
    area_hectares: 14.5,
    metrics: {
      ndvi_mean: 0.74, // 0.0 to 1.0 (High vigor)
      ndvi_status: 'Excellent Vegetation Density',
      canopy_moisture_index: 0.68,
      chlorophyll_index: 0.81,
      surface_temperature_c: 28.4,
      drought_vulnerability_score: 'Low (12/100)'
    },
    zones: [
      { name: 'Zone Alpha (North East)', ndvi: 0.82, area_pct: 40, status: 'Healthy', recommendation: 'Maintain standard fertilization' },
      { name: 'Zone Beta (Center Slope)', ndvi: 0.71, area_pct: 35, status: 'Moderate', recommendation: 'Slight nitrogen boost recommended' },
      { name: 'Zone Gamma (South Trench)', ndvi: 0.58, area_pct: 25, status: 'Water Deficit', recommendation: 'Increase drip irrigation frequency by 15%' }
    ]
  });
});

// GET /api/weather/forecast — 7-day micro-climate & smart irrigation engine
app.get('/api/weather/forecast', (req, res) => {
  const forecast = [
    { day: 'Today', temp_high: 32, temp_low: 23, condition: 'Sunny', rain_chance: 10, humidity: 55, et0_mm: 5.2, water_needed_liters_acre: 4200 },
    { day: 'Tomorrow', temp_high: 33, temp_low: 24, condition: 'Partly Cloudy', rain_chance: 20, humidity: 60, et0_mm: 4.8, water_needed_liters_acre: 3800 },
    { day: 'Thu', temp_high: 31, temp_low: 22, condition: 'Light Rain', rain_chance: 70, humidity: 78, et0_mm: 2.1, water_needed_liters_acre: 0 },
    { day: 'Fri', temp_high: 30, temp_low: 22, condition: 'Thunderstorm', rain_chance: 85, humidity: 82, et0_mm: 1.8, water_needed_liters_acre: 0 },
    { day: 'Sat', temp_high: 32, temp_low: 23, condition: 'Sunny', rain_chance: 15, humidity: 58, et0_mm: 4.9, water_needed_liters_acre: 3900 },
    { day: 'Sun', temp_high: 34, temp_low: 25, condition: 'Clear', rain_chance: 5, humidity: 50, et0_mm: 5.6, water_needed_liters_acre: 4500 },
    { day: 'Mon', temp_high: 33, temp_low: 24, condition: 'Partly Cloudy', rain_chance: 25, humidity: 62, et0_mm: 4.5, water_needed_liters_acre: 3600 }
  ];

  res.json({
    success: true,
    location: 'District Nashik, Maharashtra',
    coordinates: { lat: 19.9975, lon: 73.7898 },
    current: { temp: 31, humidity: 58, wind_kmh: 14, solar_radiation: '720 W/m²', heat_index: 'Normal' },
    smart_irrigation_recommendation: {
      action: 'Run Drip Irrigation Today',
      optimal_time: '05:30 AM - 07:30 AM',
      duration_minutes: 120,
      liters_per_acre: 4200,
      skip_days: ['Thu', 'Fri'], // Skip due to rain forecast
      efficiency_rating: '94% (Saved 1,800L with weather-based evapotranspiration adjustment)'
    },
    forecast
  });
});

// POST /api/pest/detect — AI Vision Leaf Disease & Pest Scanner
app.post('/api/pest/detect', (req, res) => {
  const { sample_id, crop } = req.body;

  const catalog = {
    tomato_blight: {
      disease_name: 'Early Blight (Alternaria solani)',
      crop: 'Tomato',
      confidence: 96.4,
      severity: 'Moderate (Level 2/4)',
      affected_area_pct: 18,
      symptoms: 'Concentric brown spots with yellow halo surrounding the leaves.',
      organic_treatment: 'Spray Neem Seed Kernel Extract (NSKE 5%) or Trichoderma viride bio-fungicide every 7 days.',
      chemical_treatment: 'Mancozeb 75% WP @ 2g/liter or Azoxystrobin 23% SC @ 1ml/liter water.',
      prevention: 'Ensure proper plant spacing for air circulation and avoid overhead foliar watering.'
    },
    wheat_rust: {
      disease_name: 'Yellow Stripe Rust (Puccinia striiformis)',
      crop: 'Wheat',
      confidence: 94.8,
      severity: 'Severe (Level 3/4)',
      affected_area_pct: 32,
      symptoms: 'Yellow pustules arranged in linear stripes along the leaf veins.',
      organic_treatment: 'Apply fermented sour buttermilk solution (1 liter in 10 liters water) + Panchagavya spray.',
      chemical_treatment: 'Propiconazole 25% EC @ 1ml/liter or Tebuconazole 50% + Trifloxystrobin 25% WG @ 0.7g/liter.',
      prevention: 'Plant resistant cultivars like HD-3086 or DBW-187 and destroy alternate host weeds.'
    },
    cotton_aphids: {
      disease_name: 'Cotton Aphid Infestation (Aphis gossypii)',
      crop: 'Cotton',
      confidence: 98.1,
      severity: 'Mild (Level 1/4)',
      affected_area_pct: 12,
      symptoms: 'Curled leaves with sticky honeydew secretions and black sooty mold growth.',
      organic_treatment: 'Spray Verticillium lecanii bio-insecticide @ 5g/liter or 2% Neem oil solution with soap.',
      chemical_treatment: 'Imidacloprid 17.8% SL @ 0.5ml/liter or Acetamiprid 20% SP @ 0.2g/liter.',
      prevention: 'Install yellow sticky traps (15 traps/acre) and release Ladybird beetles (predatory natural enemies).'
    },
    rice_blast: {
      disease_name: 'Rice Leaf Blast (Magnaporthe oryzae)',
      crop: 'Rice / Paddy',
      confidence: 95.2,
      severity: 'High (Level 3/4)',
      affected_area_pct: 28,
      symptoms: 'Spindle-shaped elliptical lesions with grey/white centers and reddish-brown margins.',
      organic_treatment: 'Foliar application of Pseudomonas fluorescens @ 10g/liter or Kasugamycin bio-antibiotic.',
      chemical_treatment: 'Tricyclazole 75% WP @ 0.6g/liter or Isoprothiolane 40% EC @ 1.5ml/liter.',
      prevention: 'Avoid excess split doses of nitrogenous fertilizers and maintain field water level.'
    }
  };

  const key = sample_id || 'tomato_blight';
  const result = catalog[key] || catalog['tomato_blight'];

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...result
  });
});

// POST /api/fertilizer/optimize — Precision dosing & eco-friendly carbon footprint score
app.post('/api/fertilizer/optimize', (req, res) => {
  const { crop = 'Wheat', land_acres = 2, target_yield_quintals = 25 } = req.body;

  const acres = Number(land_acres) || 1;

  res.json({
    success: true,
    crop,
    land_acres: acres,
    target_yield_quintals,
    synthetic_doses: [
      { name: 'Urea (46% N)', total_kg: Math.round(45 * acres), schedule: '30% basal, 35% at tillering, 35% at flowering' },
      { name: 'DAP (18:46:0)', total_kg: Math.round(25 * acres), schedule: '100% basal dose during soil preparation' },
      { name: 'MOP (60% K)', total_kg: Math.round(20 * acres), schedule: '50% basal, 50% at panicle initiation' }
    ],
    organic_alternatives: [
      { name: 'Vermicompost + Neem Cake', replace_pct: '30% Chemical Urea replacement', benefit: 'Increases soil organic carbon & microbial activity' },
      { name: 'Bio-Fertilizer (Azotobacter + PSB)', replace_pct: '20% DAP replacement', benefit: 'Fixes atmospheric Nitrogen and solubilizes soil Phosphorus naturally' },
      { name: 'Liquid Nano Urea (500ml bottle)', replace_pct: 'Replaces 1 bag of 45kg conventional Urea', benefit: 'Zero ground water pollution & 85% foliar absorption rate' }
    ],
    sustainability_score: {
      eco_rating: 'A+ (Regenerative Agriculture Standard)',
      carbon_footprint_saved_kg_co2e: Math.round(145 * acres),
      soil_microbiome_health_boost: '+28%',
      water_retention_increase: '+18%'
    }
  });
});

function marketError(res, err) {
  const status = err.appStatus || 502;
  console.error('[MARKET]', err.code || 'ERROR');
  return res.status(status).json({
    success: false,
    code: err.code || 'MARKET_UNAVAILABLE',
    message: err.publicMessage || 'Unable to retrieve current mandi prices.',
  });
}

app.get('/api/market/prices', async (req, res) => {
  try {
    const data = await marketService.getPrices(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    marketError(res, err);
  }
});

app.get('/api/market/crop', async (req, res) => {
  try {
    const commodity = String(req.query.commodity || '').trim();
    if (!commodity) {
      return res.status(400).json({
        success: false,
        code: 'BAD_REQUEST',
        message: 'Choose a crop to view its price trend.',
      });
    }
    const data = await marketService.getCommodity(commodity, req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    marketError(res, err);
  }
});

app.get('/api/market/crops/:commodity/history', async (req, res) => {
  try {
    const data = await marketService.getHistory(decodeURIComponent(req.params.commodity), req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    marketError(res, err);
  }
});

app.get('/api/market/crops/:commodity', async (req, res) => {
  try {
    const data = await marketService.getCommodity(decodeURIComponent(req.params.commodity), req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    marketError(res, err);
  }
});

app.get('/api/market/trends', async (req, res) => {
  try {
    const data = await marketService.getTrends(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    marketError(res, err);
  }
});

app.get('/api/market/markets', async (req, res) => {
  try {
    const data = await marketService.getMarkets(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    marketError(res, err);
  }
});

app.get('/api/market/mandis', async (req, res) => {
  try {
    const data = await marketService.getMarkets(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    marketError(res, err);
  }
});

app.get('/api/market/status', async (req, res) => {
  try {
    const data = await marketService.getStatus();
    res.json({ success: true, ...data });
  } catch (err) {
    marketError(res, err);
  }
});

app.get('/api/market/summary', async (req, res) => {
  try {
    const data = await marketService.getSummary(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    marketError(res, err);
  }
});

app.get('/api/market/forecast', async (req, res) => {
  try {
    const data = await marketService.getSummary(req.query);
    res.json({
      success: true,
      source: data.source,
      lastUpdated: data.lastUpdated,
      crops: (data.commodities || []).map((row) => ({
        crop: row.commodity,
        top_mandi: row.market,
        current_price_rs_quintal: row.modalPrice,
        date: row.date,
        change1d: row.change1d,
        signal: row.signal,
      })),
    });
  } catch (err) {
    marketError(res, err);
  }
});

const PORT = process.env.PORT || 5005;
app.listen(PORT, () => {
  console.log(`Node.js Backend server running on port ${PORT}`);
  console.log(`Fast2SMS configured: ${process.env.FAST2SMS_API_KEY ? 'yes' : 'no'}`);
  console.log(`DATA_GOV_API_KEY loaded: ${Boolean(String(process.env.DATA_GOV_API_KEY || '').trim())}`);
  setTimeout(() => {
    marketService.ensureSnapshot({}).catch((err) => {
      console.error('[MARKET SYNC]', err.code || err.message);
    });
  }, 1200);
  const sixHours = 6 * 60 * 60 * 1000;
  setInterval(() => {
    marketService.syncDaily({}).catch((err) => {
      console.error('[MARKET SYNC]', err.code || err.message);
    });
  }, sixHours);

  simulationEngine.start().then((info) => {
    if (info?.started) {
      console.log(`[simulation] telemetry every ${info.intervalMs}ms`);
    } else if (info?.reason) {
      console.log(`[simulation] not started: ${info.reason}`);
    }
  }).catch((err) => {
    console.error('[simulation]', err.message);
  });

  espIngest.start().then((info) => {
    if (info?.started) {
      console.log(`[esp] polling ${info.gateway} every ${info.intervalMs}ms`);
    } else if (info?.reason) {
      console.log(`[esp] not started: ${info.reason}`);
    }
  }).catch((err) => {
    console.error('[esp]', err.message);
  });
});
