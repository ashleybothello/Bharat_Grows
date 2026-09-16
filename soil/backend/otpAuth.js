const otpService = require('./services/otp/otpService');
const farmerStore = require('./services/farmerStore');
const simulationEngine = require('./services/telemetry/simulationEngine');
const anomalyService = require('./services/telemetry/anomalyService');

function jsonError(res, status, message, code) {
  const body = { success: false, message };
  if (code) body.code = code;
  return res.status(status).json(body);
}

function readPhone(body = {}) {
  return otpService.normalizePhone(body.phone || body.mobile);
}

function readPurpose(body = {}, phone) {
  const raw = String(body.purpose || body.mode || body.type || '').trim().toLowerCase();
  if (raw === 'signup' || raw === 'register') return 'signup';
  if (raw === 'login') return 'login';
  if (phone && farmerStore.peekPending(phone)) return 'signup';
  return 'login';
}

function publicOtpError(err) {
  const raw = err.message || '';
  const code = err.code;
  if (code === 'ACCOUNT_NOT_FOUND') {
    return { status: 404, message: raw, code };
  }
  if (code === 'ACCOUNT_ALREADY_EXISTS') {
    return { status: 409, message: raw, code };
  }
  if (code === 'INVALID_MOBILE') {
    return { status: 400, message: raw, code };
  }
  if (code === 'OTP_INVALID' || raw === 'Invalid OTP') {
    return {
      status: 400,
      code: 'OTP_INVALID',
      message: 'The OTP is incorrect. Please check the message and try again.',
    };
  }
  if (code === 'OTP_EXPIRED' || raw === 'OTP expired') {
    return {
      status: 400,
      code: 'OTP_EXPIRED',
      message: 'This OTP has expired. Please request a new one.',
    };
  }
  if (code === 'OTP_RATE_LIMITED' || err.appStatus === 429) {
    return { status: 429, code: 'OTP_RATE_LIMITED', message: raw };
  }
  if (err.appStatus === 400) {
    return { status: 400, message: raw, code: code || 'INVALID_MOBILE' };
  }
  if (err.appStatus === 409) {
    return { status: 409, message: raw, code: code || 'ACCOUNT_ALREADY_EXISTS' };
  }
  if (err.appStatus === 404) {
    return { status: 404, message: raw, code: code || 'ACCOUNT_NOT_FOUND' };
  }
  if (err.appStatus === 502 || /fast2sms|sms/i.test(raw)) {
    return {
      status: 502,
      code: 'OTP_SEND_FAILED',
      message: raw.includes('wallet') || raw.includes('₹100')
        ? raw
        : "We couldn't send the OTP right now. Please try again in a moment.",
    };
  }
  if (err.appStatus) {
    return { status: err.appStatus, message: raw || 'Something went wrong on our side. Please try again.', code };
  }
  return {
    status: 502,
    code: 'OTP_SEND_FAILED',
    message: "We couldn't send the OTP right now. Please try again in a moment.",
  };
}

function requireValidPhone(phone) {
  if (!phone) {
    const err = new Error('Phone number is required.');
    err.appStatus = 400;
    err.code = 'INVALID_MOBILE';
    throw err;
  }
  if (!otpService.isValidIndianPhone(phone)) {
    const err = new Error('Please enter a valid 10-digit mobile number.');
    err.appStatus = 400;
    err.code = 'INVALID_MOBILE';
    throw err;
  }
  return phone;
}

async function assertEligibleForOtp(phone, purpose) {
  const existing = await farmerStore.findByPhone(phone);
  if (purpose === 'signup') {
    if (existing) {
      const err = new Error('An account already exists with this mobile number.');
      err.appStatus = 409;
      err.code = 'ACCOUNT_ALREADY_EXISTS';
      throw err;
    }
    return null;
  }
  if (!existing) {
    const err = new Error('No BharatGrow account was found with this mobile number.');
    err.appStatus = 404;
    err.code = 'ACCOUNT_NOT_FOUND';
    throw err;
  }
  return existing;
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return String(req.headers['x-session-token'] || req.body?.token || '').trim();
}

function withSession(farmer, token, message) {
  return {
    success: true,
    message: message || 'Phone number verified',
    token,
    farmer: farmerStore.publicFarmer(farmer),
  };
}

async function sendOtp(req, res) {
  try {
    const phone = requireValidPhone(readPhone(req.body));
    const purpose = readPurpose(req.body, phone);
    await assertEligibleForOtp(phone, purpose);
    const payload = await otpService.issueOtp(phone, { purpose });
    return res.json(payload);
  } catch (err) {
    const { status, message, code } = publicOtpError(err);
    if (code !== 'ACCOUNT_NOT_FOUND' && code !== 'ACCOUNT_ALREADY_EXISTS' && code !== 'INVALID_MOBILE') {
      console.error('[OTP SEND]', err.providerData || err.message);
    }
    return jsonError(res, status, message, code);
  }
}

async function resendOtp(req, res) {
  try {
    const phone = requireValidPhone(readPhone(req.body));
    const purpose = readPurpose(req.body, phone);
    await assertEligibleForOtp(phone, purpose);
    otpService.clearOtp(phone);
    const payload = await otpService.issueOtp(phone, { isResend: true, purpose });
    return res.json(payload);
  } catch (err) {
    const { status, message, code } = publicOtpError(err);
    if (code !== 'ACCOUNT_NOT_FOUND' && code !== 'ACCOUNT_ALREADY_EXISTS' && code !== 'INVALID_MOBILE') {
      console.error('[OTP RESEND]', err.providerData || err.message);
    }
    return jsonError(res, status, message, code);
  }
}

async function register(req, res) {
  try {
    const profile = farmerStore.sanitizeProfile(req.body || {});
    const invalid = farmerStore.validateProfile(profile);
    if (invalid) {
      const code = /mobile|phone/i.test(invalid) ? 'INVALID_MOBILE' : undefined;
      return jsonError(res, 400, invalid, code);
    }

    await assertEligibleForOtp(profile.phone, 'signup');
    farmerStore.rememberPending(profile.phone, profile, 'signup');
    const payload = await otpService.issueOtp(profile.phone, { purpose: 'signup' });
    return res.json({
      ...payload,
      message: 'OTP sent successfully',
    });
  } catch (err) {
    const { status, message, code } = publicOtpError(err);
    if (code !== 'ACCOUNT_ALREADY_EXISTS' && code !== 'INVALID_MOBILE') {
      console.error('[OTP REGISTER]', err.providerData || err.message);
    }
    return jsonError(res, status, message, code);
  }
}

async function verifyOtp(req, res) {
  try {
    const phone = readPhone(req.body);
    const otp = String(req.body?.otp || '').trim();
    const purpose = readPurpose(req.body, phone);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const village = typeof req.body?.village === 'string' ? req.body.village.trim() : '';

    if (!phone && !otp) return jsonError(res, 400, 'Phone and OTP are required.', 'INVALID_MOBILE');
    requireValidPhone(phone);
    if (!otp) return jsonError(res, 400, 'OTP is required.', 'OTP_INVALID');
    if (!/^\d{6}$/.test(otp)) {
      return jsonError(res, 400, 'The OTP is incorrect. Please check the message and try again.', 'OTP_INVALID');
    }

    otpService.verifyStoredOtp(phone, otp, purpose);

    if (purpose === 'signup') {
      const pending = farmerStore.takePendingRecord(phone);
      if (!pending?.profile || pending.purpose !== 'signup') {
        return jsonError(
          res,
          400,
          'Please complete farmer registration before verifying this OTP.',
          'OTP_INVALID',
        );
      }
      const farmer = await farmerStore.createFarmer(phone, {
        name: name || pending.profile.fullName,
        village: village || pending.profile.village,
        profile: pending.profile,
      });
      const token = farmerStore.createSession(phone);
      simulationEngine.ensureNodesForFarmer(farmer).catch((err) => {
        console.error('[OTP VERIFY] node provision:', err.message);
      });
      return res.json(withSession(farmer, token, 'Farmer profile created'));
    }

    const farmer = await farmerStore.markLogin(phone);
    if (!farmer) {
      return jsonError(
        res,
        404,
        'No BharatGrow account was found with this mobile number.',
        'ACCOUNT_NOT_FOUND',
      );
    }
    const token = farmerStore.createSession(phone);
    simulationEngine.ensureNodesForFarmer(farmer).catch((err) => {
      console.error('[OTP VERIFY] node provision:', err.message);
    });
    return res.json(withSession(farmer, token));
  } catch (err) {
    const { status, message, code } = publicOtpError(err);
    if (!err.appStatus) console.error('[OTP VERIFY]', err.message);
    return jsonError(res, status || 500, message || 'Something went wrong on our side. Please try again.', code);
  }
}

async function updateAlertEmail(req, res) {
  try {
    const token = bearerToken(req);
    const phone = farmerStore.phoneFromToken(token);
    if (!phone) return jsonError(res, 401, 'Please sign in again.');
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError(res, 400, 'Please enter a valid email address.', 'INVALID_EMAIL');
    }
    const farmer = await farmerStore.mergeProfile(phone, { email });
    anomalyService.invalidateFarmerContact(farmer.id);
    return res.json({ success: true, farmer: farmerStore.publicFarmer(farmer) });
  } catch {
    return jsonError(res, 500, 'Could not save the alert email.');
  }
}

async function me(req, res) {
  try {
    const token = bearerToken(req);
    const phone = farmerStore.phoneFromToken(token);
    if (!phone) return jsonError(res, 401, 'Please sign in again.');
    const farmer = await farmerStore.findByPhone(phone);
    if (!farmer) return jsonError(res, 404, 'Farmer profile not found.', 'ACCOUNT_NOT_FOUND');
    return res.json({ success: true, farmer: farmerStore.publicFarmer(farmer) });
  } catch {
    return jsonError(res, 500, 'Something went wrong on our side. Please try again.');
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  resendOtp,
  register,
  me,
  updateAlertEmail,
};
