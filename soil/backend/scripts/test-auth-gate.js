process.env.OTP_PROVIDER = 'mock';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.OTP_MAX_SENDS_PER_WINDOW = '50';
process.env.DATABASE_URL = '';

const otpAuth = require('../otpAuth');
const farmerStore = require('../services/farmerStore');
const otpService = require('../services/otp/otpService');
const mockOtpProvider = require('../services/otp/mockOtpProvider');
const fast2smsOtpProvider = require('../services/otp/fast2smsOtpProvider');

let fast2smsCalls = 0;
const originalFastSend = fast2smsOtpProvider.send;
fast2smsOtpProvider.send = async function wrappedFast2SmsSend(...args) {
  fast2smsCalls += 1;
  return originalFastSend.apply(this, args);
};

const results = [];

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function mockReq(body) {
  return { body, headers: {} };
}

function assert(name, condition, extra) {
  results.push({ name, ok: Boolean(condition), extra: extra || '' });
  const mark = condition ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${extra ? ` — ${extra}` : ''}`);
}

function profileFor(phone) {
  return {
    fullName: 'Test Farmer',
    phone,
    preferredLanguage: 'en',
    state: 'Maharashtra',
    district: 'Pune',
    taluka: 'Haveli',
    village: 'Testgaon',
    pincode: '411001',
    farmSize: 2,
    primaryCrop: 'Wheat',
  };
}

async function run() {
  const loginPhone = '9867550101';
  const missingPhone = '9867550102';
  const signupPhone = '9867550103';
  const wrongOtpPhone = '9867550104';
  const expiredPhone = '9867550105';

  await farmerStore.upsertFarmer(loginPhone, {
    name: 'Existing Farmer',
    village: 'Indore',
    profile: { fullName: 'Existing Farmer', village: 'Indore', primaryCrop: 'Soybean' },
  });

  // TEST 1: existing + login → OTP sent → verify → session
  otpService.resetProviderSendCount();
  const t1send = mockRes();
  await otpAuth.sendOtp(mockReq({ phone: loginPhone, purpose: 'login' }), t1send);
  const loginOtp = mockOtpProvider.lastMockOtp();
  const t1verify = mockRes();
  await otpAuth.verifyOtp(mockReq({ phone: loginPhone, otp: loginOtp, purpose: 'login' }), t1verify);
  assert(
    'TEST 1 existing mobile + login OTP + verify',
    t1send.statusCode === 200 &&
      t1send.body?.success === true &&
      t1verify.statusCode === 200 &&
      t1verify.body?.token &&
      t1verify.body?.farmer?.phone === loginPhone,
    `send=${t1send.statusCode} verify=${t1verify.statusCode}`,
  );

  // TEST 2: unknown + login → no OTP
  otpService.resetProviderSendCount();
  const before2 = otpService.getProviderSendCount();
  const t2 = mockRes();
  await otpAuth.sendOtp(mockReq({ mobile: missingPhone, purpose: 'login' }), t2);
  assert(
    'TEST 2 non-existing mobile + login ACCOUNT_NOT_FOUND',
    t2.statusCode === 404 &&
      t2.body?.code === 'ACCOUNT_NOT_FOUND' &&
      otpService.getProviderSendCount() === before2 &&
      fast2smsCalls === 0,
    `status=${t2.statusCode} code=${t2.body?.code} providerSends=${otpService.getProviderSendCount()}`,
  );

  // TEST 3: existing + signup → no OTP
  otpService.resetProviderSendCount();
  const before3 = otpService.getProviderSendCount();
  const t3 = mockRes();
  await otpAuth.sendOtp(mockReq({ phone: loginPhone, purpose: 'signup' }), t3);
  const t3reg = mockRes();
  await otpAuth.register(mockReq(profileFor(loginPhone)), t3reg);
  assert(
    'TEST 3 existing mobile + signup ACCOUNT_ALREADY_EXISTS',
    t3.statusCode === 409 &&
      t3.body?.code === 'ACCOUNT_ALREADY_EXISTS' &&
      t3reg.statusCode === 409 &&
      otpService.getProviderSendCount() === before3,
    `send=${t3.statusCode} register=${t3reg.statusCode}`,
  );

  // TEST 4: new + signup → OTP → profile
  otpService.resetProviderSendCount();
  const t4reg = mockRes();
  await otpAuth.register(mockReq(profileFor(signupPhone)), t4reg);
  const signupOtp = mockOtpProvider.lastMockOtp();
  const t4badPurpose = mockRes();
  await otpAuth.verifyOtp(mockReq({ phone: signupPhone, otp: signupOtp, purpose: 'login' }), t4badPurpose);
  const t4ok = mockRes();
  await otpAuth.verifyOtp(mockReq({
    phone: signupPhone,
    otp: signupOtp,
    purpose: 'signup',
    name: 'Test Farmer',
    village: 'Testgaon',
  }), t4ok);
  assert(
    'TEST 4 new mobile + signup OTP + profile creation',
    t4reg.statusCode === 200 &&
      t4reg.body?.success === true &&
      t4badPurpose.body?.success !== true &&
      t4ok.statusCode === 200 &&
      t4ok.body?.token &&
      t4ok.body?.farmer?.phone === signupPhone,
    `register=${t4reg.statusCode} loginPurposeBlocked=${t4badPurpose.statusCode} verify=${t4ok.statusCode}`,
  );

  // TEST 5: format variants normalize to the same number
  const variants = ['+91 98675 50587', '+919867550587', '98675 50587', '9867550587', '09867550587'];
  const normalized = [...new Set(variants.map((value) => otpService.normalizePhone(value)))];
  assert(
    'TEST 5 +91 / spacing / 10-digit normalize to 9867550587',
    normalized.length === 1 && normalized[0] === '9867550587',
    `got=${normalized.join(',')}`,
  );

  // TEST 6: wrong OTP must not login
  const t6send = mockRes();
  await otpAuth.sendOtp(mockReq({ phone: loginPhone, purpose: 'login' }), t6send);
  const t6 = mockRes();
  await otpAuth.verifyOtp(mockReq({ phone: loginPhone, otp: '000000', purpose: 'login' }), t6);
  const t6signup = mockRes();
  await otpAuth.sendOtp(mockReq({ phone: wrongOtpPhone, purpose: 'signup' }), t6signup);
  await otpAuth.verifyOtp(mockReq({ phone: wrongOtpPhone, otp: '111111', purpose: 'signup' }), mockRes());
  const created = await farmerStore.findByPhone(wrongOtpPhone);
  assert(
    'TEST 6 wrong OTP does not authenticate',
    t6.statusCode === 400 &&
      t6.body?.code === 'OTP_INVALID' &&
      t6.body?.success === false &&
      !t6.body?.token &&
      !created,
    `loginVerify=${t6.statusCode} code=${t6.body?.code}`,
  );

  // TEST 7: expired OTP must not login
  await farmerStore.upsertFarmer(expiredPhone, {
    name: 'Expiry Farmer',
    village: 'Bhopal',
    profile: { fullName: 'Expiry Farmer', village: 'Bhopal', primaryCrop: 'Wheat' },
  });
  const t7send = mockRes();
  await otpAuth.sendOtp(mockReq({ phone: expiredPhone, purpose: 'login' }), t7send);
  const expiredOtp = mockOtpProvider.lastMockOtp();
  otpService.expireStoredOtp(expiredPhone);
  const t7 = mockRes();
  await otpAuth.verifyOtp(mockReq({ phone: expiredPhone, otp: expiredOtp, purpose: 'login' }), t7);
  assert(
    'TEST 7 expired OTP does not authenticate',
    t7.statusCode === 400 && t7.body?.code === 'OTP_EXPIRED' && !t7.body?.token,
    `status=${t7.statusCode} code=${t7.body?.code}`,
  );

  // TEST 8: direct API login OTP for nonexistent number — provider never called
  otpService.resetProviderSendCount();
  fast2smsCalls = 0;
  const t8 = mockRes();
  await otpAuth.sendOtp(mockReq({ mobile: '9998887776', purpose: 'login' }), t8);
  const t8alias = mockRes();
  await otpAuth.sendOtp(mockReq({ phone: '9998887776' }), t8alias);
  assert(
    'TEST 8 direct login OTP for nonexistent number rejects without Fast2SMS',
    t8.statusCode === 404 &&
      t8.body?.code === 'ACCOUNT_NOT_FOUND' &&
      t8alias.statusCode === 404 &&
      otpService.getProviderSendCount() === 0 &&
      fast2smsCalls === 0,
    `status=${t8.statusCode} providerSends=${otpService.getProviderSendCount()} fast2smsCalls=${fast2smsCalls}`,
  );

  const failed = results.filter((row) => !row.ok);
  console.log('\n---');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
