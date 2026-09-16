const axios = require('axios');

function friendlySmsMessage(raw) {
  const text = String(raw || '');
  if (/transaction of 100/i.test(text) || /100 INR/i.test(text)) {
    return 'Fast2SMS still needs a wallet recharge of ₹100 or more before the API can send SMS.';
  }
  if (/insufficient|low balance|not enough/i.test(text)) {
    return 'Fast2SMS wallet balance is too low to send SMS.';
  }
  if (/invalid.*(auth|key|authorization)/i.test(text)) {
    return 'Fast2SMS rejected the API key. Check FAST2SMS_API_KEY in soil/backend/.env.';
  }
  if (/dlt|template|sender/i.test(text)) {
    return text;
  }
  return text;
}

function providerMessage(data) {
  if (!data) return '';
  if (Array.isArray(data.message) && data.message[0]) return friendlySmsMessage(data.message[0]);
  if (typeof data.message === 'string' && data.message.trim()) return friendlySmsMessage(data.message);
  if (data.error) return friendlySmsMessage(data.error);
  return '';
}

function accepted(data) {
  return Boolean(data && data.return === true);
}

function otpPayload(phone, otp) {
  const payload = {
    route: 'otp',
    variables_values: otp,
    numbers: phone,
    flash: '0',
  };
  if (process.env.FAST2SMS_OTP_ID) payload.otp_id = process.env.FAST2SMS_OTP_ID;
  if (process.env.FAST2SMS_TEMPLATE_ID) payload.template_id = process.env.FAST2SMS_TEMPLATE_ID;
  if (process.env.FAST2SMS_SENDER_ID) payload.sender_id = process.env.FAST2SMS_SENDER_ID;
  return payload;
}

function quickPayload(phone, otp) {
  const payload = {
    route: process.env.FAST2SMS_ROUTE || 'q',
    message: `Your BharatGrow OTP is ${otp}. Valid for 5 minutes. Do not share this code.`,
    language: 'english',
    flash: '0',
    numbers: phone,
  };
  if (process.env.FAST2SMS_SENDER_ID) payload.sender_id = process.env.FAST2SMS_SENDER_ID;
  return payload;
}

async function postForm(payload, apiKey) {
  return axios.post(
    'https://www.fast2sms.com/dev/bulkV2',
    new URLSearchParams(payload).toString(),
    {
      headers: {
        authorization: apiKey,
        'content-type': 'application/x-www-form-urlencoded',
        'cache-control': 'no-cache',
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
}

async function postOtpSend(payload, apiKey) {
  return axios.post('https://www.fast2sms.com/dev/otp/send', payload, {
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
      'cache-control': 'no-cache',
    },
    timeout: 15000,
    validateStatus: () => true,
  });
}

async function postJson(payload, apiKey) {
  return axios.post('https://www.fast2sms.com/dev/bulkV2', payload, {
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
      'cache-control': 'no-cache',
    },
    timeout: 15000,
    validateStatus: () => true,
  });
}

async function getQuery(payload, apiKey) {
  return axios.get('https://www.fast2sms.com/dev/bulkV2', {
    params: { authorization: apiKey, ...payload },
    headers: {
      authorization: apiKey,
      'cache-control': 'no-cache',
    },
    timeout: 15000,
    validateStatus: () => true,
  });
}

async function send({ phone, otp }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    const err = new Error('SMS service is not configured on the server.');
    err.appStatus = 500;
    throw err;
  }

  const otpBody = otpPayload(phone, otp);
  const quickBody = quickPayload(phone, otp);

  const attempts = [
    () => postOtpSend(otpBody, apiKey),
    () => postJson(otpBody, apiKey),
    () => postForm(otpBody, apiKey),
    () => getQuery(otpBody, apiKey),
    () => postForm(quickBody, apiKey),
    () => getQuery(quickBody, apiKey),
  ];

  let lastData = null;
  for (const attempt of attempts) {
    const response = await attempt();
    lastData = response.data;
    if (accepted(response.data)) return { delivered: true };
  }

  const err = new Error(providerMessage(lastData) || 'Fast2SMS did not send the SMS. Check wallet, API key, and OTP settings.');
  err.appStatus = 502;
  err.providerData = lastData;
  throw err;
}

module.exports = { send };
