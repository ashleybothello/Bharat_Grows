/**
 * Manual "Simulate anomaly" alerts — templates, every-click notify, and
 * delivery failure must not drop the saved anomaly.
 *
 *   node scripts/test-manual-anomaly-alert.js
 */

process.env.FAST2SMS_API_KEY = '';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';

const alerts = require('../services/telemetry/alertService');

let pass = 0;
let fail = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const sms = alerts.buildManualSms({
  nodeNumber: 3,
  sensorLabel: 'Nitrogen',
  value: 7,
  unit: 'mg/kg',
});
assert('sms names node 03', sms.includes('Node 03'));
assert('sms names sensor', sms.includes('Nitrogen'));
assert('sms includes value', sms.includes('7'));
assert('sms stays short', sms.length <= 160, `len ${sms.length}`);

const mail = alerts.buildManualEmail({
  farmerName: 'Test Farmer',
  farmName: 'Test Farm',
  nodeNumber: 2,
  sensorLabel: 'Soil Moisture',
  status: 'CRITICAL',
  value: 12,
  unit: '%',
  detectedAt: new Date('2026-09-16T01:00:00Z'),
});
assert('email subject names node 02', mail.subject.includes('Node 02'));
assert('email body names farmer', mail.text.includes('Test Farmer'));
assert('email body names farm', mail.text.includes('Test Farm'));
assert('email body names sensor', mail.text.includes('Soil Moisture'));
assert('html fallback present', Boolean(mail.html && mail.text));

(async () => {
  const failed = await alerts.dispatchManualAnomalyAlert({
    recipientEmail: 'farmer@example.com',
    recipientPhone: '9876543210',
    farmerName: 'Test Farmer',
    farmName: 'Test Farm',
    nodeNumber: 3,
    sensorLabel: 'Nitrogen',
    status: 'CRITICAL',
    value: 7,
    unit: 'mg/kg',
    detectedAt: new Date(),
  });
  assert('sms attempted when unconfigured', failed.smsAttempted === true);
  assert('email attempted when unconfigured', failed.emailAttempted === true);
  assert('sms not marked sent without Fast2SMS', failed.smsSent === false);
  assert('email not marked sent without SMTP', failed.emailSent === false);

  delete require.cache[require.resolve('../services/telemetry/anomalyService')];
  const storePath = require.resolve('../services/telemetry/telemetryStore');
  const alertPath = require.resolve('../services/telemetry/alertService');
  const inserted = [];
  const dispatches = [];
  let nextId = 1;

  require.cache[storePath] = {
    id: storePath,
    filename: storePath,
    loaded: true,
    exports: {
      dbEnabled: () => false,
      async insertAnomaly(a) {
        const row = { id: nextId++, ...a };
        inserted.push(row);
        return row;
      },
      async markAnomalyDispatch() { return null; },
      async resolveOpenAnomalies() { return 0; },
    },
  };
  require.cache[alertPath] = {
    id: alertPath,
    filename: alertPath,
    loaded: true,
    exports: {
      async dispatchCriticalAlert() {
        return { emailSent: true, smsSent: true, emailError: null, smsError: null };
      },
      async dispatchManualAnomalyAlert(payload) {
        dispatches.push(payload);
        if (dispatches.length === 2) {
          return {
            emailSent: true, smsSent: false,
            emailAttempted: true, smsAttempted: true,
            emailError: null, smsError: 'SMS mocked failure',
          };
        }
        if (dispatches.length === 3) {
          return {
            emailSent: false, smsSent: true,
            emailAttempted: true, smsAttempted: true,
            emailError: 'Email mocked failure', smsError: null,
          };
        }
        return {
          emailSent: true, smsSent: true,
          emailAttempted: true, smsAttempted: true,
          emailError: null, smsError: null,
        };
      },
    },
  };

  const anomalyService = require('../services/telemetry/anomalyService');
  const farmer = { id: 1, name: 'Test Farmer', profile: { farmName: 'Test Farm', email: 'farmer@example.com' } };
  const node = {
    node_id: 'BG-NODE-003',
    node_number: 3,
    farm_id: 'FARM-1',
    farm_name: 'Test Farm',
  };

  const first = await anomalyService.notifyManualSimulation({
    farmer, node, sensorKey: 'nitrogen', value: 7, status: 'CRITICAL',
  });
  assert('first click persists an anomaly', inserted.length === 1);
  assert('first click notifies both channels', first.notifications.sms.sent && first.notifications.email.sent);

  const second = await anomalyService.notifyManualSimulation({
    farmer, node, sensorKey: 'nitrogen', value: 7, status: 'CRITICAL',
  });
  assert('second click persists another anomaly', inserted.length === 2);
  assert('second click still notifies', dispatches.length === 2);
  assert('sms failure still returns email sent', second.notifications.email.sent === true);
  assert('sms failure is reported', second.notifications.sms.sent === false);
  assert('anomaly kept after sms failure', Boolean(second.anomaly?.id));

  const moisture = await anomalyService.notifyManualSimulation({
    farmer,
    node: { ...node, node_id: 'BG-NODE-002', node_number: 2 },
    sensorKey: 'soil_moisture',
    value: 12,
    status: 'CRITICAL',
  });
  assert('moisture click notifies', dispatches.length === 3);
  assert('moisture payload uses Soil Moisture', dispatches[2].sensorLabel === 'Soil Moisture');
  assert('moisture payload uses node 2', dispatches[2].nodeNumber === 2);
  assert('email failure still returns sms sent', moisture.notifications.sms.sent === true);
  assert('email failure is reported', moisture.notifications.email.sent === false);
  assert('anomaly kept after email failure', Boolean(moisture.anomaly?.id));

  console.log(`\nmanual anomaly alerts: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
