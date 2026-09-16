let lastSend = null;

function send({ phone, otp }) {
  lastSend = { phone, otp, at: Date.now() };
  console.log(`[OTP:mock] ${phone} → ${otp}`);
  return { delivered: true, mock: true };
}

function lastMockOtp() {
  return lastSend?.otp || null;
}

function lastMockSend() {
  return lastSend;
}

module.exports = { send, lastMockOtp, lastMockSend };
