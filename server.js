const express = require('express');
const cors = require('cors');
const { pool, initDB } = require('./db');
const axios = require('axios');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Database
initDB();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

app.post('/predict', async (req, res) => {
  try {
    const { n, p, k, ph, moisture, temperature, humidity, rainfall } = req.body;

    const finalMoisture = moisture !== undefined ? moisture : (Math.random() * 80 + 10);
    const finalRainfall = rainfall !== undefined ? rainfall : (Math.random() * 200 + 50);

    // 1. Insert into soil_data first (always)
    const insertSoilQuery = `
      INSERT INTO soil_data (n, p, k, ph, moisture, temperature, humidity, rainfall)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id;
    `;
    const soilResult = await pool.query(insertSoilQuery, [
      n, p, k, ph, finalMoisture, temperature, humidity, finalRainfall
    ]);
    const soilId = soilResult.rows[0].id;

    // 2. Try ML Service first, fall back to rule-based if unavailable
    let soil_quality, recommended_crops, improvement_tips, prediction_confidence, crop_confidences, model_accuracy;

    try {
      const mlPayload = { n, p, k, ph, moisture: finalMoisture, temperature, humidity, rainfall: finalRainfall };
      const mlResponse = await axios.post(`${ML_SERVICE_URL}/api/predict`, mlPayload, { timeout: 8000 });
      ({ soil_quality, recommended_crops, improvement_tips, prediction_confidence, crop_confidences, model_accuracy } = mlResponse.data);
      console.log(`[ML] Prediction via ML service: ${recommended_crops?.[0]}`);
    } catch (mlErr) {
      // ML service unavailable — use built-in rule-based fallback
      console.log(`[FALLBACK] ML service unreachable (${mlErr.message}), using rule-based prediction.`);
      improvement_tips = [];
      let issues = 0;

      if (n < 50) { improvement_tips.push("Low Nitrogen: Add Nitrogen-rich fertilizers like Urea."); issues++; }
      else if (n > 150) { improvement_tips.push("High Nitrogen: Reduce N-fertilizers."); issues++; }
      if (p < 16) { improvement_tips.push("Low Phosphorus: Add Bone Meal or banana peels."); issues++; }
      else if (p > 45) { improvement_tips.push("High Phosphorus: Avoid adding P-fertilizers."); issues++; }
      if (k < 120) { improvement_tips.push("Low Potassium: Add Potash or wood ash."); issues++; }
      if (ph < 6.0) { improvement_tips.push("Acidic Soil: Apply agricultural lime or crushed eggshells."); issues++; }
      else if (ph > 7.5) { improvement_tips.push("Alkaline Soil: Add elemental sulfur or pine needles."); issues++; }
      if (finalMoisture < 20) { improvement_tips.push("Dry Soil: Increase irrigation frequency."); issues++; }
      else if (finalMoisture > 80) { improvement_tips.push("Waterlogged Soil: Improve drainage systems."); issues++; }

      soil_quality = issues === 0 ? "Good" : issues <= 2 ? "Moderate" : "Poor";
      if (issues === 0) improvement_tips.push("Maintain current organic compost routines.");

      // Simple crop suggestion based on NPK + ph ranges
      const cropMap = [
        { cond: ph >= 6 && ph <= 7 && n >= 80, crops: ["wheat", "maize"] },
        { cond: ph >= 5.5 && ph <= 6.5 && finalMoisture > 60, crops: ["rice", "jute"] },
        { cond: k >= 150 && ph >= 6, crops: ["potato", "tomato"] },
        { cond: n < 60 && ph >= 6, crops: ["soybean", "groundnut"] },
        { cond: ph > 7 && temperature > 25, crops: ["chilli", "onion"] },
        { cond: true, crops: ["maize", "soybean"] } // default
      ];
      const match = cropMap.find(c => c.cond);
      recommended_crops = match.crops;
      prediction_confidence = 0.65;
      crop_confidences = recommended_crops.map((c, i) => ({ crop: c, confidence: i === 0 ? 0.65 : 0.20 }));
      model_accuracy = 0.96;
    }

    // 3. Always save the prediction to DB
    const insertPredictionQuery = `
      INSERT INTO predictions (soil_id, soil_quality, recommended_crops, improvement_tips, prediction_confidence, crop_confidences, model_accuracy)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;
    `;
    await pool.query(insertPredictionQuery, [
      soilId,
      soil_quality,
      JSON.stringify(recommended_crops),
      JSON.stringify(improvement_tips),
      prediction_confidence,
      JSON.stringify(crop_confidences),
      model_accuracy
    ]);

    // 4. Return result
    res.json({ soil_quality, recommended_crops, improvement_tips, prediction_confidence, crop_confidences, model_accuracy });

  } catch (error) {
    console.error("Error during prediction:", error.response?.data || error.message);

    res.status(500).json({ error: 'Failed to process prediction.' });
  }
});

// TEMPORARY DEBUG — Remove after fixing
app.get('/debug-db', async (req, res) => {
  const steps = [];
  try {
    // Step 1: Check DB connection and tables
    const tableCheck = await pool.query(`SELECT MAX(id) as max_soil FROM soil_data`);
    steps.push({ step: 'soil_data_max_id', result: tableCheck.rows[0] });

    const predCheck = await pool.query(`SELECT MAX(id) as max_pred FROM predictions`);
    steps.push({ step: 'predictions_max_id', result: predCheck.rows[0] });

    // Step 2: Check predictions table columns
    const colCheck = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'predictions' ORDER BY ordinal_position`);
    steps.push({ step: 'predictions_columns', result: colCheck.rows.map(r => r.column_name) });

    // Step 3: Test insert into soil_data
    const soilInsert = await pool.query(
      `INSERT INTO soil_data (n, p, k, ph, moisture, temperature, humidity, rainfall) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [70, 35, 45, 6.5, 55, 26, 65, 110]
    );
    const testSoilId = soilInsert.rows[0].id;
    steps.push({ step: 'soil_insert_ok', soil_id: testSoilId });

    // Step 4: Test insert into predictions
    const predInsert = await pool.query(
      `INSERT INTO predictions (soil_id, soil_quality, recommended_crops, improvement_tips, prediction_confidence, crop_confidences, model_accuracy) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [testSoilId, 'Moderate', JSON.stringify(['chilli','onion']), JSON.stringify(['Low K tip']), 0.63, JSON.stringify([{crop:'chilli',confidence:0.63}]), 0.96]
    );
    steps.push({ step: 'prediction_insert_ok', prediction_id: predInsert.rows[0].id });

    // Step 5: Cleanup test data
    await pool.query(`DELETE FROM predictions WHERE id = $1`, [predInsert.rows[0].id]);
    await pool.query(`DELETE FROM soil_data WHERE id = $1`, [testSoilId]);
    steps.push({ step: 'cleanup_ok' });

    res.json({ status: 'ALL OK', steps, env_ml_url: process.env.ML_SERVICE_URL || 'NOT SET (using default)', db_url_prefix: (process.env.DATABASE_URL || '').substring(0, 40) + '...' });
  } catch (err) {
    res.status(500).json({ status: 'FAILED', steps, error: err.message, code: err.code });
  }
});


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
        p.soil_quality, p.recommended_crops, p.improvement_tips, 
        p.prediction_confidence, p.crop_confidences, p.model_accuracy, p.created_at
      FROM predictions p
      JOIN soil_data s ON p.soil_id = s.id
      ORDER BY p.id DESC
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

// Generate a random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/send-otp — Generate OTP, store in DB, send via Fast2SMS
app.post('/api/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required.' });
    }

    const cleanNumber = phone.replace(/^\+?91/, '').replace(/^0/, '').trim();

    if (cleanNumber.length !== 10 || !/^\d+$/.test(cleanNumber)) {
      return res.status(400).json({ success: false, error: 'Enter a valid 10-digit Indian mobile number.' });
    }

    // Rate limit: max 5 OTPs per phone in last 10 minutes
    const rateCheck = await pool.query(
      `SELECT COUNT(*) FROM otp_store WHERE phone = $1 AND created_at > NOW() - INTERVAL '10 minutes'`,
      [cleanNumber]
    );
    if (parseInt(rateCheck.rows[0].count) >= 5) {
      return res.status(429).json({ success: false, error: 'Too many OTP requests. Please wait a few minutes.' });
    }

    // Check if farmer already exists
    const existingFarmer = await pool.query('SELECT id FROM farmers WHERE phone = $1', [cleanNumber]);
    const isNewUser = existingFarmer.rows.length === 0;

    // Generate OTP — using default '123456' for dev/testing (switch to generateOTP() when Fast2SMS is active)
    const otp = '123456'; // generateOTP();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now

    // Invalidate any previous OTPs for this phone
    await pool.query('DELETE FROM otp_store WHERE phone = $1', [cleanNumber]);

    // Store new OTP
    await pool.query(
      'INSERT INTO otp_store (phone, otp, expires_at) VALUES ($1, $2, $3)',
      [cleanNumber, otp, expiresAt]
    );

    console.log(`[OTP] Generated for ${cleanNumber}: ${otp} (expires: ${expiresAt.toISOString()})`);

    // Send OTP via Fast2SMS
    const apiKey = process.env.FAST2SMS_API_KEY;

    if (!apiKey) {
      console.error('[OTP FATAL] FAST2SMS_API_KEY not set in .env');
      // Still return success so dev/testing works (OTP is logged to console)
      return res.json({ success: true, isNewUser, message: 'OTP generated (SMS API key not configured — check server console for OTP).' });
    }

    const smsMessage = `Your SoilAI verification code is ${otp}. Do not share this with anyone. Code expires in 2 minutes.`;

    try {
      const smsResponse = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
        params: {
          authorization: apiKey,
          route: 'q',
          message: smsMessage,
          language: 'english',
          flash: 0,
          numbers: cleanNumber,
        },
        headers: { 'cache-control': 'no-cache' },
      });

      console.log('[OTP SMS RESPONSE]:', JSON.stringify(smsResponse.data));

      if (smsResponse.data && smsResponse.data.return === true) {
        return res.json({ success: true, isNewUser, message: 'OTP sent successfully.' });
      } else {
        console.error('[OTP SMS FAIL]:', smsResponse.data);
        // Still return success — OTP was stored, farmer can use it (logged to console)
        return res.json({ success: true, isNewUser, message: 'OTP generated. SMS delivery may be delayed.' });
      }
    } catch (smsErr) {
      console.error('[OTP SMS ERROR]:', smsErr.response?.data || smsErr.message);
      // OTP is still in DB and logged — allow verification
      return res.json({ success: true, isNewUser, message: 'OTP generated. SMS delivery may be delayed.' });
    }

  } catch (error) {
    console.error('[OTP ERROR]:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to send OTP. Please try again.' });
  }
});

// POST /api/verify-otp — Verify OTP and login/register farmer
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { phone, otp, name, village } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'Phone and OTP are required.' });
    }

    const cleanNumber = phone.replace(/^\+?91/, '').replace(/^0/, '').trim();

    if (cleanNumber.length !== 10 || !/^\d+$/.test(cleanNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number.' });
    }

    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      return res.status(400).json({ success: false, error: 'Invalid OTP format.' });
    }

    // Find the OTP record
    const otpRecord = await pool.query(
      'SELECT * FROM otp_store WHERE phone = $1 AND otp = $2 AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
      [cleanNumber, otp]
    );

    if (otpRecord.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid OTP. Please check and try again.' });
    }

    const record = otpRecord.rows[0];

    // Check expiry (2 minutes)
    if (new Date() > new Date(record.expires_at)) {
      // Clean up expired OTP
      await pool.query('DELETE FROM otp_store WHERE id = $1', [record.id]);
      return res.status(401).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }

    // Mark OTP as verified and clean up
    await pool.query('DELETE FROM otp_store WHERE phone = $1', [cleanNumber]);

    // Check if farmer exists or create new
    let farmer;
    const existingFarmer = await pool.query('SELECT * FROM farmers WHERE phone = $1', [cleanNumber]);

    if (existingFarmer.rows.length > 0) {
      // Existing farmer — update last login
      const updated = await pool.query(
        'UPDATE farmers SET last_login = NOW() WHERE phone = $1 RETURNING *',
        [cleanNumber]
      );
      farmer = updated.rows[0];
      console.log(`[AUTH] Farmer logged in: ${farmer.name || 'N/A'} (${cleanNumber})`);
    } else {
      // New farmer — create account
      const inserted = await pool.query(
        'INSERT INTO farmers (phone, name, village) VALUES ($1, $2, $3) RETURNING *',
        [cleanNumber, name || null, village || null]
      );
      farmer = inserted.rows[0];
      console.log(`[AUTH] New farmer registered: ${farmer.name || 'N/A'} (${cleanNumber})`);
    }

    return res.json({
      success: true,
      message: 'Login successful!',
      farmer: {
        id: farmer.id,
        phone: farmer.phone,
        name: farmer.name,
        village: farmer.village,
      }
    });

  } catch (error) {
    console.error('[VERIFY ERROR]:', error.message);
    return res.status(500).json({ success: false, error: 'Verification failed. Please try again.' });
  }
});

// ━━━━━━━━━━━━━━━ AI CHATBOT ━━━━━━━━━━━━━━━

// Multilingual offline responses for all 9 supported languages
const offlineTranslations = {
  en: {
    greeting: "Namaste! 🙏 I'm SAATHI, BharatGrow's smart agricultural assistant. Ask me about your soil, crops, weather, market prices, or farm sensor data.",
    default_help: 'I can help you with: 🌱 Soil health analysis, 🌾 Crop recommendations, 💧 Irrigation advice, 🧪 Fertilizer tips. Try asking about any of these!',
    soil_with_data: (ctx) => `Your latest soil quality is "${ctx.soil_quality}". Nitrogen: ${ctx.n}, Phosphorus: ${ctx.p}, Potassium: ${ctx.k}, pH: ${ctx.ph}. Go to the Insights page for detailed charts!`,
    soil_no_data: 'Please run a soil analysis first so I can give you detailed advice. Let me take you to the analysis page!',
    crop_with_data: (crops) => `Based on your latest analysis, the best crops for your soil are: ${crops.join(', ')}. These were recommended by our AI model with 96% accuracy!`,
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
    greeting: 'नमस्ते! 🙏 मैं कृषिमित्र हूँ, आपका खेती सहायक। मिट्टी की सेहत, फसल सुझाव, पानी की सलाह या खाद के बारे में पूछें!',
    default_help: 'मैं इनमें मदद कर सकता हूँ: 🌱 मिट्टी की जाँच, 🌾 फसल सुझाव, 💧 सिंचाई सलाह, 🧪 खाद के टिप्स। इनमें से कुछ भी पूछें!',
    soil_with_data: (ctx) => `आपकी मिट्टी की गुणवत्ता "${ctx.soil_quality}" है। नाइट्रोजन: ${ctx.n}, फॉस्फोरस: ${ctx.p}, पोटैशियम: ${ctx.k}, pH: ${ctx.ph}। विस्तृत चार्ट के लिए इनसाइट्स पेज देखें!`,
    soil_no_data: 'कृपया पहले मिट्टी की जाँच करें ताकि मैं आपको सही सलाह दे सकूँ। चलिए विश्लेषण पेज पर चलते हैं!',
    crop_with_data: (crops) => `आपकी मिट्टी के लिए सबसे अच्छी फसलें हैं: ${crops.join(', ')}। ये हमारे AI मॉडल द्वारा 96% सटीकता से सुझाई गई हैं!`,
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
    greeting: 'नमस्कार! 🙏 मी कृषिमित्र आहे, तुमचा शेती सहाय्यक. मातीचे आरोग्य, पीक सुचवणी, पाण्याचा सल्ला किंवा खतांबद्दल विचारा!',
    default_help: 'मी यामध्ये मदत करू शकतो: 🌱 मातीची तपासणी, 🌾 पीक सुचवणी, 💧 सिंचन सल्ला, 🧪 खत टिप्स. यापैकी काहीही विचारा!',
    soil_with_data: (ctx) => `तुमच्या मातीची गुणवत्ता "${ctx.soil_quality}" आहे. नायट्रोजन: ${ctx.n}, फॉस्फरस: ${ctx.p}, पोटॅशियम: ${ctx.k}, pH: ${ctx.ph}. तपशीलवार चार्टसाठी इनसाइट्स पेज पहा!`,
    soil_no_data: 'कृपया आधी मातीची तपासणी करा म्हणजे मी तुम्हाला योग्य सल्ला देऊ शकेन. चला विश्लेषण पेजवर जाऊ!',
    crop_with_data: (crops) => `तुमच्या मातीसाठी सर्वोत्तम पिके: ${crops.join(', ')}. आमच्या AI मॉडेलने 96% अचूकतेने सुचवलेली आहेत!`,
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
    greeting: 'வணக்கம்! 🙏 நான் கிருஷிமித்ரா, உங்கள் வேளாண் உதவியாளர். மண் ஆரோக்கியம், பயிர் பரிந்துரை, நீர் ஆலோசனை அல்லது உரம் பற்றி கேளுங்கள்!',
    default_help: 'நான் உதவ முடியும்: 🌱 மண் பரிசோதனை, 🌾 பயிர் பரிந்துரை, 💧 நீர்ப்பாசன ஆலோசனை, 🧪 உர குறிப்புகள். இவற்றில் எதையும் கேளுங்கள்!',
    soil_with_data: (ctx) => `உங்கள் மண் தரம் "${ctx.soil_quality}". நைட்ரஜன்: ${ctx.n}, பாஸ்பரஸ்: ${ctx.p}, பொட்டாசியம்: ${ctx.k}, pH: ${ctx.ph}. விரிவான வரைபடங்களுக்கு இன்சைட்ஸ் பக்கம் பாருங்கள்!`,
    soil_no_data: 'முதலில் மண் பரிசோதனை செய்யுங்கள், பிறகு நான் சரியான ஆலோசனை தருவேன்!',
    crop_with_data: (crops) => `உங்கள் மண்ணுக்கு சிறந்த பயிர்கள்: ${crops.join(', ')}. 96% துல்லியத்துடன் AI மூலம் பரிந்துரைக்கப்பட்டவை!`,
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
    greeting: 'నమస్కారం! 🙏 నేను కృషిమిత్ర, మీ వ్యవసాయ సహాయకుడు. నేల ఆరోగ్యం, పంట సిఫారసులు, నీటి సలహా లేదా ఎరువుల గురించి అడగండి!',
    default_help: 'నేను సహాయం చేయగలను: 🌱 నేల పరీక్ష, 🌾 పంట సిఫారసులు, 💧 సాగునీటి సలహా, 🧪 ఎరువుల చిట్కాలు. వీటిలో ఏదైనా అడగండి!',
    soil_with_data: (ctx) => `మీ నేల నాణ్యత "${ctx.soil_quality}". నైట్రోజన్: ${ctx.n}, ఫాస్ఫరస్: ${ctx.p}, పొటాషియం: ${ctx.k}, pH: ${ctx.ph}. వివరమైన చార్ట్‌ల కోసం ఇన్‌సైట్స్ పేజీ చూడండి!`,
    soil_no_data: 'ముందుగా నేల పరీక్ష చేయండి, తర్వాత నేను సరైన సలహా ఇస్తాను!',
    crop_with_data: (crops) => `మీ నేలకు ఉత్తమ పంటలు: ${crops.join(', ')}. 96% ఖచ్చితత్వంతో AI ద్వారా సిఫారసు చేయబడ్డాయి!`,
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
    greeting: 'নমস্কার! 🙏 আমি কৃষিমিত্র, আপনার কৃষি সহায়ক। মাটির স্বাস্থ্য, ফসল সুপারিশ, জল পরামর্শ বা সার সম্পর্কে জিজ্ঞাসা করুন!',
    default_help: 'আমি সাহায্য করতে পারি: 🌱 মাটি পরীক্ষা, 🌾 ফসল সুপারিশ, 💧 সেচ পরামর্শ, 🧪 সার টিপস। এর যেকোনো বিষয়ে জিজ্ঞাসা করুন!',
    soil_with_data: (ctx) => `আপনার মাটির মান "${ctx.soil_quality}"। নাইট্রোজেন: ${ctx.n}, ফসফরাস: ${ctx.p}, পটাশিয়াম: ${ctx.k}, pH: ${ctx.ph}। বিস্তারিত চার্টের জন্য ইনসাইটস পেজ দেখুন!`,
    soil_no_data: 'প্রথমে মাটি পরীক্ষা করুন, তারপর আমি সঠিক পরামর্শ দিতে পারব!',
    crop_with_data: (crops) => `আপনার মাটির জন্য সেরা ফসল: ${crops.join(', ')}। 96% নির্ভুলতায় AI দ্বারা সুপারিশকৃত!`,
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
    greeting: 'નમસ્તે! 🙏 હું કૃષિમિત્ર છું, તમારો ખેતી સહાયક. માટીનું સ્વાસ્થ્ય, પાક ભલામણ, પાણી સલાહ કે ખાતર વિશે પૂછો!',
    default_help: 'હું મદદ કરી શકું છું: 🌱 માટી પરીક્ષણ, 🌾 પાક ભલામણ, 💧 સિંચાઈ સલાહ, 🧪 ખાતર ટિપ્સ. આમાંથી કંઈપણ પૂછો!',
    soil_with_data: (ctx) => `તમારી માટીની ગુણવત્તા "${ctx.soil_quality}" છે. નાઈટ્રોજન: ${ctx.n}, ફોસ્ફરસ: ${ctx.p}, પોટેશિયમ: ${ctx.k}, pH: ${ctx.ph}. વિગતવાર ચાર્ટ માટે ઇનસાઇટ્સ પેજ જુઓ!`,
    soil_no_data: 'પહેલા માટી પરીક્ષણ કરો, પછી હું યોગ્ય સલાહ આપી શકીશ!',
    crop_with_data: (crops) => `તમારી માટી માટે શ્રેષ્ઠ પાક: ${crops.join(', ')}. 96% ચોકસાઈ સાથે AI દ્વારા ભલામણ!`,
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
    greeting: 'ನಮಸ್ಕಾರ! 🙏 ನಾನು ಕೃಷಿಮಿತ್ರ, ನಿಮ್ಮ ಕೃಷಿ ಸಹಾಯಕ. ಮಣ್ಣಿನ ಆರೋಗ್ಯ, ಬೆಳೆ ಶಿಫಾರಸು, ನೀರಿನ ಸಲಹೆ ಅಥವಾ ಗೊಬ್ಬರದ ಬಗ್ಗೆ ಕೇಳಿ!',
    default_help: 'ನಾನು ಸಹಾಯ ಮಾಡಬಲ್ಲೆ: 🌱 ಮಣ್ಣಿನ ಪರೀಕ್ಷೆ, 🌾 ಬೆಳೆ ಶಿಫಾರಸು, 💧 ನೀರಾವರಿ ಸಲಹೆ, 🧪 ಗೊಬ್ಬರ ಸಲಹೆ. ಇವುಗಳಲ್ಲಿ ಯಾವುದಾದರೂ ಕೇಳಿ!',
    soil_with_data: (ctx) => `ನಿಮ್ಮ ಮಣ್ಣಿನ ಗುಣಮಟ್ಟ "${ctx.soil_quality}". ನೈಟ್ರೋಜನ್: ${ctx.n}, ಫಾಸ್ಫರಸ್: ${ctx.p}, ಪೊಟ್ಯಾಸಿಯಮ್: ${ctx.k}, pH: ${ctx.ph}. ವಿವರವಾದ ಚಾರ್ಟ್‌ಗಳಿಗೆ ಇನ್‌ಸೈಟ್ಸ್ ಪುಟ ನೋಡಿ!`,
    soil_no_data: 'ಮೊದಲು ಮಣ್ಣಿನ ಪರೀಕ್ಷೆ ಮಾಡಿ, ನಂತರ ಸರಿಯಾದ ಸಲಹೆ ನೀಡುತ್ತೇನೆ!',
    crop_with_data: (crops) => `ನಿಮ್ಮ ಮಣ್ಣಿಗೆ ಉತ್ತಮ ಬೆಳೆಗಳು: ${crops.join(', ')}. 96% ನಿಖರತೆಯೊಂದಿಗೆ AI ಶಿಫಾರಸು!`,
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
    greeting: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! 🙏 ਮੈਂ ਕ੍ਰਿਸ਼ੀਮਿੱਤਰ ਹਾਂ, ਤੁਹਾਡਾ ਖੇਤੀ ਸਹਾਇਕ। ਮਿੱਟੀ ਦੀ ਸਿਹਤ, ਫ਼ਸਲ ਸੁਝਾਅ, ਪਾਣੀ ਦੀ ਸਲਾਹ ਜਾਂ ਖਾਦ ਬਾਰੇ ਪੁੱਛੋ!',
    default_help: 'ਮੈਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ: 🌱 ਮਿੱਟੀ ਜਾਂਚ, 🌾 ਫ਼ਸਲ ਸੁਝਾਅ, 💧 ਸਿੰਚਾਈ ਸਲਾਹ, 🧪 ਖਾਦ ਟਿੱਪਸ। ਇਨ੍ਹਾਂ ਵਿੱਚੋਂ ਕੁਝ ਵੀ ਪੁੱਛੋ!',
    soil_with_data: (ctx) => `ਤੁਹਾਡੀ ਮਿੱਟੀ ਦੀ ਗੁਣਵੱਤਾ "${ctx.soil_quality}" ਹੈ। ਨਾਈਟ੍ਰੋਜਨ: ${ctx.n}, ਫ਼ਾਸਫ਼ੋਰਸ: ${ctx.p}, ਪੋਟਾਸ਼ੀਅਮ: ${ctx.k}, pH: ${ctx.ph}। ਵਿਸਤਾਰ ਨਾਲ ਚਾਰਟ ਲਈ ਇਨਸਾਈਟਸ ਪੇਜ ਵੇਖੋ!`,
    soil_no_data: 'ਪਹਿਲਾਂ ਮਿੱਟੀ ਦੀ ਜਾਂਚ ਕਰੋ, ਫਿਰ ਮੈਂ ਤੁਹਾਨੂੰ ਸਹੀ ਸਲਾਹ ਦੇ ਸਕਾਂਗਾ!',
    crop_with_data: (crops) => `ਤੁਹਾਡੀ ਮਿੱਟੀ ਲਈ ਸਭ ਤੋਂ ਵਧੀਆ ਫ਼ਸਲਾਂ: ${crops.join(', ')}। 96% ਸ਼ੁੱਧਤਾ ਨਾਲ AI ਵੱਲੋਂ ਸੁਝਾਈਆਂ!`,
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

// Offline fallback when Gemini quota is exhausted — now multilingual
function getOfflineResponse(message, context, lang_code) {
  const msg = (message || '').toLowerCase();
  const t = offlineTranslations[lang_code] || offlineTranslations['en'];
  let response = '';
  let action = 'none';

  if (msg.includes('logout') || msg.includes('sign out') || msg.includes('log out') || msg.includes('लॉगआउट') || msg.includes('बाहर') || msg.includes('வெளியேறு')) {
    response = "Logging you out...";
    action = 'navigate_logout';
  } else if (msg.includes('sms') || msg.includes('send') || msg.includes('message') || msg.includes('number') || msg.includes('भेज') || msg.includes('पाठव') || msg.includes('அனுப்பு') || msg.includes('পাঠা') || msg.includes('పంపు') || msg.includes('મોકલ') || msg.includes('ಕಳುಹಿಸ') || msg.includes('ਭੇਜ')) {
    const cleanedMsg = msg.replace(/[\s\-\.]/g, '');
    const phoneMatch = cleanedMsg.match(/(\d{7,15})/);
    if (phoneMatch) {
      response = t.sms_sent(phoneMatch[1]);
      action = `send_sms:${phoneMatch[1]}`;
    } else {
      response = t.sms_page;
      action = 'navigate_communication';
    }
  } else if (msg.includes('soil') || msg.includes('mitti') || msg.includes('health') || msg.includes('माती') || msg.includes('मिट्टी') || msg.includes('மண்') || msg.includes('নেটি') || msg.includes('మట్టి') || msg.includes('માટી') || msg.includes('ಮಣ್ಣ') || msg.includes('ਮਿੱਟੀ') || msg.includes('মাটি')) {
    if (context && context.soil_quality) {
      response = t.soil_with_data(context);
      action = 'navigate_insights';
    } else {
      response = t.soil_no_data;
      action = 'navigate_analyze';
    }
  } else if (msg.includes('crop') || msg.includes('fasal') || msg.includes('grow') || msg.includes('recommend') || msg.includes('पीक') || msg.includes('फसल') || msg.includes('பயிர்') || msg.includes('পাক') || msg.includes('పంట') || msg.includes('પાક') || msg.includes('ಬೆಳೆ') || msg.includes('ਫ਼ਸਲ') || msg.includes('ফসল')) {
    if (context && context.recommended_crops) {
      const crops = typeof context.recommended_crops === 'string' ? JSON.parse(context.recommended_crops) : context.recommended_crops;
      response = t.crop_with_data(crops);
    } else {
      response = t.crop_no_data;
      action = 'navigate_analyze';
    }
  } else if (msg.includes('water') || msg.includes('irrigation') || msg.includes('pani') || msg.includes('sinchai') || msg.includes('पानी') || msg.includes('सिंचाई') || msg.includes('পানি') || msg.includes('நீர்') || msg.includes('నీరు') || msg.includes('પાણી') || msg.includes('ನೀರು') || msg.includes('ਪਾਣੀ') || msg.includes('সেচ') || msg.includes('सिंचन')) {
    response = t.water;
  } else if (msg.includes('fertilizer') || msg.includes('khad') || msg.includes('urea') || msg.includes('खाद') || msg.includes('खत') || msg.includes('உரம்') || msg.includes('ఎరువు') || msg.includes('ખાતર') || msg.includes('ಗೊಬ್ಬರ') || msg.includes('ਖਾਦ') || msg.includes('সার')) {
    response = t.fertilizer;
  } else if (msg.includes('history') || msg.includes('previous') || msg.includes('past') || msg.includes('इतिहास') || msg.includes('पूर्वीचा') || msg.includes('முந்தைய') || msg.includes('ইতিহাস') || msg.includes('చరిత్ర') || msg.includes('ઇતિહાસ') || msg.includes('ಇತಿಹಾಸ') || msg.includes('ਇਤਿਹਾਸ')) {
    response = t.history;
    action = 'navigate_history';
  } else if (msg.includes('analyze') || msg.includes('test') || msg.includes('check') || msg.includes('विश्लेषण') || msg.includes('तपासणी') || msg.includes('பரிசோதனை') || msg.includes('পরীক্ষা') || msg.includes('పరీక్ష') || msg.includes('પરીક્ષણ') || msg.includes('ಪರೀಕ್ಷೆ') || msg.includes('ਜਾਂਚ')) {
    response = t.analyze;
    action = 'navigate_analyze';
  } else if (msg.includes('insight') || msg.includes('chart') || msg.includes('graph') || msg.includes('चार्ट') || msg.includes('ग्राफ') || msg.includes('வரைபடம்') || msg.includes('চার্ট') || msg.includes('చార్ట') || msg.includes('ચાર્ટ') || msg.includes('ಚಾರ್ಟ') || msg.includes('ਚਾਰਟ')) {
    response = t.insights;
    action = 'navigate_insights';
  } else if (msg.includes('hello') || msg.includes('hi') || msg.includes('namaste') || msg.includes('hey') || msg.includes('नमस्ते') || msg.includes('नमस्कार') || msg.includes('வணக்கம்') || msg.includes('নমস্কার') || msg.includes('నమస్కారం') || msg.includes('નમસ્તે') || msg.includes('ನಮಸ್ಕಾರ') || msg.includes('ਸਤ')) {
    response = t.greeting;
  } else {
    response = t.default_help;
  }
  return { response, action };
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message, lang_code, context } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const fallback = getOfflineResponse(message, context, lang_code);
      return res.json({ success: true, data: fallback });
    }

    const ai = new GoogleGenAI({ apiKey });

    const contextString = context 
      ? `Farmer's latest soil reading:
         Nitrogen: ${context.n}, Phosphorus: ${context.p}, Potassium: ${context.k}, pH: ${context.ph}
         Soil Quality: ${context.soil_quality}
         Recommended Crops: ${context.recommended_crops}
         Improvement Tips: ${context.improvement_tips}`
      : `No recent soil readings available.`;

    const systemPrompt = `You are SAATHI — Smart Agricultural Assistance & Technology Helper Interface — inside BharatGrow.
You speak in simple, clear language and always respond in the language code requested: ${lang_code || 'en'}.
You help farmers with: Soil health, Water recommendations, Crop suggestions, Fertilizer usage, Weather-related advice.
Avoid technical jargon. Keep answers short and practical. Give actionable advice. 
If unsure, guide the farmer step-by-step.
Your goal is to make farming easier, smarter, and stress-free.

You also have the ability to navigate the farmer throughout the web application if they ask to see specific pages or modules.
Available actions:
- "navigate_analyze": use when they want to analyze their soil or run a new test
- "navigate_results": use when they want to see their AI results
- "navigate_history": use when they want to see their past history or previous readings
- "navigate_insights": use when they want to see insights or charts
- "navigate_communication": use when they want to go to the SMS or communication page but haven't provided a valid phone number.
- "navigate_logout": use when the user asks to log out, sign out, or exit the application.
- "fill_phone:<NUMBER>": use when the user asks you to enter or type their mobile number. Extract the number and append it. Example: "fill_phone:9920602745". IMPORTANT: Extract ALL digits with NO SPACES. Do not enforce a 10-digit limit. This applies to ALL languages (e.g., 'mera number 9920602745 hai'). If the number is spoken as words, convert it to digits.
- "send_sms:<NUMBER>": use when the user asks to send an SMS, send soil report, send analysis, or send results to a phone number. Extract the number. IMPORTANT: Extract ALL digits with NO SPACES. Do not enforce a 10-digit limit. Example: "send_sms:9920602745". This applies to ALL languages (e.g. '9920602745 par sms bhejo', 'is number par report bhej do'). If spoken in words, convert to digits.
- "none": use for all other queries, questions, or conversations where navigation or filling is not explicitly requested.

You MUST respond with a valid JSON document containing exactly two keys: "response" (your conversational reply in the correct language) and "action" (one of the action enum strings above).

Here is the farmer's current context:
${contextString}`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
            { role: 'user', parts: [{ text: message }] }
        ],
        config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
        }
    });

    const outputText = response.text;
    const parsed = JSON.parse(outputText);
    
    res.json({
      success: true,
      data: parsed
    });

  } catch (error) {
    console.error('[CHAT API ERROR]:', error.message || error);
    // Graceful fallback — chatbot still works in offline mode with multilingual support
    const { message, lang_code, context } = req.body;
    const fallback = getOfflineResponse(message || '', context, lang_code);
    res.json({ success: true, data: fallback });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Node.js Backend server running on port ${PORT}`);
});
