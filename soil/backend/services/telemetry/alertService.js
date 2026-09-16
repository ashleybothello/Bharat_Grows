/**
 * Critical alert delivery — email (Nodemailer) and SMS (Fast2SMS).
 *
 * Only ever invoked for a NORMAL -> CRITICAL transition. AVERAGE and BAD are
 * recorded as anomalies but never notified.
 *
 * CREDENTIALS
 * Every secret is read from process.env at call time and nothing is logged or
 * returned to the caller. No credential is exposed to React: the frontend can
 * see only whether a given anomaly's email/sms flags were set.
 *
 * RECIPIENTS
 * Derived on the server from the authenticated farmer's own record — the
 * frontend never supplies a recipient address or phone number.
 */

const axios = require('axios');
const nodemailer = require('nodemailer');

/** Configured only when a host and user are both present. */
function smtpConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || '').trim() &&
    String(process.env.SMTP_USER || '').trim()
  );
}

function smsConfigured() {
  return Boolean(String(process.env.FAST2SMS_API_KEY || '').trim());
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!smtpConfigured()) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

function formatTimestamp(date) {
  return new Date(date).toLocaleString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: process.env.ALERT_TIMEZONE || 'Asia/Kolkata',
  });
}

/**
 * Build the email for one critical event.
 * `criticalSensors` may hold several entries; all are listed.
 */
function buildEmail({ nodeNumber, criticalSensors, detectedAt, farmName, zone }) {
  const single = criticalSensors.length === 1;
  const subject = `BharatGrow Alert — Node ${nodeNumber} Critical Anomaly Detected`;

  const sensorBlock = criticalSensors
    .map((s) => `${s.label}\n\nValue:\n${s.value}${s.unit ? ` ${s.unit}` : ''}\n\nStatus:\nCRITICAL`)
    .join('\n\n---\n\n');

  const text = [
    'BharatGrow Critical Alert',
    '',
    `Node: Node ${nodeNumber}`,
    '',
    single ? 'Anomaly Detected:' : `Anomalies Detected (${criticalSensors.length} sensors critical):`,
    sensorBlock,
    '',
    'Detected At:',
    formatTimestamp(detectedAt),
    '',
    'Farm:',
    farmName || '—',
    '',
    'Zone:',
    zone || '—',
    '',
    'Please inspect the affected area.',
  ].join('\n');

  const rows = criticalSensors
    .map(
      (s) => `<tr>
        <td style="padding:8px 14px;border-bottom:1px solid #e6e2d8;">${s.label}</td>
        <td style="padding:8px 14px;border-bottom:1px solid #e6e2d8;font-weight:600;">${s.value}${s.unit ? ` ${s.unit}` : ''}</td>
        <td style="padding:8px 14px;border-bottom:1px solid #e6e2d8;color:#b3261e;font-weight:700;">CRITICAL</td>
      </tr>`
    )
    .join('');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#faf7f0;padding:24px;color:#2b2b28;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e2d8;border-radius:12px;overflow:hidden;">
      <div style="background:#1b4332;color:#f7f4ec;padding:18px 22px;">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.75;">BharatGrow Critical Alert</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">Node ${nodeNumber} — Critical Anomaly</div>
      </div>
      <div style="padding:22px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="text-align:left;color:#6b7269;font-size:11px;letter-spacing:.1em;text-transform:uppercase;">
              <th style="padding:0 14px 8px;">Sensor</th>
              <th style="padding:0 14px 8px;">Value</th>
              <th style="padding:0 14px 8px;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:20px;font-size:14px;line-height:1.9;">
          <div><strong>Detected At:</strong> ${formatTimestamp(detectedAt)}</div>
          <div><strong>Farm:</strong> ${farmName || '—'}</div>
          <div><strong>Zone:</strong> ${zone || '—'}</div>
        </div>
        <p style="margin-top:22px;font-size:14px;color:#4a5048;">Please inspect the affected area.</p>
      </div>
    </div>
  </div>`;

  return { subject, text, html };
}

/** SMS text. Kept short so it fits a single segment. */
function buildSms({ nodeNumber, criticalSensors }) {
  const first = criticalSensors[0];
  const extra = criticalSensors.length > 1 ? ` +${criticalSensors.length - 1} more sensor(s) critical.` : '';
  return `BharatGrow Alert: Node ${nodeNumber} anomaly detected. ${first.label} = ${first.value}${first.unit ? ` ${first.unit}` : ''} (CRITICAL).${extra} Check your farm immediately.`;
}

function padNode(nodeNumber) {
  return String(nodeNumber).padStart(2, '0');
}

/** Manual Farm Map "Simulate anomaly" SMS — short enough for a single segment. */
function buildManualSms({ nodeNumber, sensorLabel, value, unit }) {
  const node = padNode(nodeNumber);
  const current = value == null || value === ''
    ? ''
    : ` Current value: ${value}${unit ? ` ${unit}` : ''}.`;
  return `BharatGrow Alert: ${sensorLabel} anomaly detected at Node ${node}.${current} Please check your farm.`;
}

function buildManualEmail({
  farmerName, farmName, nodeNumber, sensorLabel, status, value, unit, detectedAt,
}) {
  const node = `Node ${padNode(nodeNumber)}`;
  const when = formatTimestamp(detectedAt || new Date());
  const current = value == null || value === '' ? '—' : `${value}${unit ? ` ${unit}` : ''}`;
  const subject = `BharatGrow Alert — Anomaly Detected at ${node}`;

  const text = [
    'BharatGrow Agricultural Sensor Alert',
    '',
    'An anomaly has been detected in your farm.',
    '',
    `Farmer: ${farmerName || '—'}`,
    `Farm: ${farmName || '—'}`,
    `Node: ${node}`,
    `Sensor: ${sensorLabel}`,
    `Status: ${status || 'CRITICAL'}`,
    `Current Value: ${current}`,
    `Time: ${when}`,
    '',
    'Please open BharatGrow Farm Map to inspect the affected node and sensor.',
    '',
    'This alert was generated by the BharatGrow agricultural monitoring system.',
  ].join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#faf7f0;padding:24px;color:#2b2b28;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e2d8;border-radius:12px;overflow:hidden;">
      <div style="background:#1b4332;color:#f7f4ec;padding:18px 22px;">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.75;">BharatGrow</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">Agricultural Sensor Alert</div>
      </div>
      <div style="padding:22px;font-size:14px;line-height:1.7;">
        <p>An anomaly has been detected in your farm sensor telemetry. Please check the BharatGrow Farm Map and take appropriate action.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
          <tr><td style="padding:6px 0;color:#6b7269;width:140px;">Farmer</td><td style="padding:6px 0;font-weight:600;">${farmerName || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7269;">Farm</td><td style="padding:6px 0;font-weight:600;">${farmName || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7269;">Node</td><td style="padding:6px 0;font-weight:600;">${node}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7269;">Sensor</td><td style="padding:6px 0;font-weight:600;">${sensorLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7269;">Status</td><td style="padding:6px 0;font-weight:700;color:#b3261e;">${status || 'CRITICAL'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7269;">Current Value</td><td style="padding:6px 0;font-weight:600;">${current}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7269;">Time</td><td style="padding:6px 0;">${when}</td></tr>
        </table>
        <p style="margin-top:22px;color:#4a5048;">Please open BharatGrow Farm Map to inspect the affected node and sensor.</p>
        <p style="margin-top:8px;font-size:12px;color:#6b7269;">This alert was generated by the BharatGrow agricultural monitoring system.</p>
      </div>
    </div>
  </div>`;

  return { subject, text, html };
}

/**
 * Manual Simulate anomaly: attempt SMS, then email. One channel's failure
 * never skips the other. Delivery errors are returned, never thrown.
 */
async function dispatchManualAnomalyAlert({
  recipientEmail, recipientPhone, farmerName, farmName,
  nodeNumber, sensorLabel, status, value, unit, detectedAt,
}) {
  const { subject, text, html } = buildManualEmail({
    farmerName, farmName, nodeNumber, sensorLabel, status, value, unit, detectedAt,
  });
  const smsText = buildManualSms({ nodeNumber, sensorLabel, value, unit });

  let sms = { attempted: true, sent: false, error: null };
  try {
    const result = await sendSms({ phone: recipientPhone, message: smsText });
    sms = { attempted: true, sent: Boolean(result.sent), error: result.error || null };
  } catch (err) {
    sms = { attempted: true, sent: false, error: err.message || 'SMS delivery failed' };
  }
  if (sms.sent) console.log('[ALERT] SMS sent to registered farmer');
  else console.error('[ALERT] SMS delivery failed');

  let email = { attempted: true, sent: false, error: null };
  try {
    const result = await sendEmail({ to: recipientEmail, subject, text, html });
    email = { attempted: true, sent: Boolean(result.sent), error: result.error || null };
  } catch (err) {
    email = { attempted: true, sent: false, error: err.message || 'Email delivery failed' };
  }
  if (email.sent) console.log('[ALERT] Email sent to registered farmer');
  else console.error('[ALERT] Email delivery failed');

  return {
    emailSent: email.sent,
    emailError: email.error,
    emailAttempted: email.attempted,
    smsSent: sms.sent,
    smsError: sms.error,
    smsAttempted: sms.attempted,
    subject,
    smsText,
  };
}

async function sendEmail({ to, subject, text, html }) {
  if (!to) return { sent: false, error: 'No recipient email on the farmer profile and ALERT_TO_EMAIL is unset.' };

  const mailer = getTransporter();
  if (!mailer) return { sent: false, error: 'SMTP is not configured (SMTP_HOST / SMTP_USER missing).' };

  try {
    await mailer.sendMail({
      from: process.env.ALERT_FROM_EMAIL || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    // Message only; never echo credentials or the transport config.
    return { sent: false, error: `Email delivery failed: ${err.message}` };
  }
}

/**
 * Send an alert SMS through Fast2SMS.
 *
 * Reuses the FAST2SMS_API_KEY the OTP flow already uses. It deliberately does
 * not touch services/otp/fast2smsOtpProvider.js, which is bound to the OTP
 * route and template; this uses the plain message route instead.
 */
async function sendSms({ phone, message }) {
  if (!phone) return { sent: false, error: 'No mobile number on the farmer profile.' };
  if (!smsConfigured()) return { sent: false, error: 'FAST2SMS_API_KEY is not configured.' };

  const payload = {
    route: process.env.FAST2SMS_ALERT_ROUTE || process.env.FAST2SMS_ROUTE || 'q',
    message,
    language: 'english',
    flash: '0',
    numbers: String(phone).replace(/\D/g, '').slice(-10),
  };
  if (process.env.FAST2SMS_SENDER_ID) payload.sender_id = process.env.FAST2SMS_SENDER_ID;

  try {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      new URLSearchParams(payload).toString(),
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          'content-type': 'application/x-www-form-urlencoded',
          'cache-control': 'no-cache',
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    if (response.data && response.data.return === true) return { sent: true };

    const raw = Array.isArray(response.data?.message)
      ? response.data.message[0]
      : response.data?.message || response.data?.error || 'Fast2SMS rejected the request.';
    return { sent: false, error: String(raw) };
  } catch (err) {
    return { sent: false, error: `SMS delivery failed: ${err.message}` };
  }
}

/**
 * Dispatch both channels for one critical transition.
 * Failures are captured rather than thrown so a delivery problem can never
 * interrupt the simulation loop or lose the persisted anomaly.
 */
async function dispatchCriticalAlert({ recipientEmail, recipientPhone, nodeNumber, criticalSensors, detectedAt, farmName, zone }) {
  const { subject, text, html } = buildEmail({ nodeNumber, criticalSensors, detectedAt, farmName, zone });
  const smsText = buildSms({ nodeNumber, criticalSensors });

  const [email, sms] = await Promise.all([
    sendEmail({ to: recipientEmail, subject, text, html }),
    sendSms({ phone: recipientPhone, message: smsText }),
  ]);

  return {
    emailSent: email.sent,
    emailError: email.error || null,
    smsSent: sms.sent,
    smsError: sms.error || null,
    subject,
    smsText,
  };
}

/** Delivery readiness, safe to expose: booleans only, never values. */
function alertConfigStatus() {
  return {
    smtpConfigured: smtpConfigured(),
    smsConfigured: smsConfigured(),
    fallbackEmailConfigured: Boolean(String(process.env.ALERT_TO_EMAIL || '').trim()),
  };
}

module.exports = {
  dispatchCriticalAlert,
  dispatchManualAnomalyAlert,
  buildEmail,
  buildSms,
  buildManualSms,
  buildManualEmail,
  sendEmail,
  sendSms,
  alertConfigStatus,
  smtpConfigured,
  smsConfigured,
  formatTimestamp,
};
