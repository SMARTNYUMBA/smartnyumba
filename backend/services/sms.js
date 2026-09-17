// Smart Nyumba Pro — SMS Service (Africa's Talking)
const pool = require('../config/db');

let AT_client = null;
let _atCacheTime = 0;
let _atCfg = null;

async function getAtCredentials() {
  // Cache for 5 minutes (same pattern as email.js)
  if (_atCfg && Date.now() - _atCacheTime < 300000) return _atCfg;
  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('at_api_key','at_username','at_sender_id','sms_enabled')"
    );
    const cfg = Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
    _atCfg = {
      apiKey:   cfg.at_api_key   || process.env.AT_API_KEY   || '',
      username: cfg.at_username  || process.env.AT_USERNAME  || 'sandbox',
      senderId: cfg.at_sender_id || process.env.AT_SENDER_ID || 'SmartNyumba',
      enabled:  cfg.sms_enabled === '1',
    };
    _atCacheTime = Date.now();
  } catch (_) {
    _atCfg = {
      apiKey:   process.env.AT_API_KEY   || '',
      username: process.env.AT_USERNAME  || 'sandbox',
      senderId: process.env.AT_SENDER_ID || 'SmartNyumba',
      enabled:  false,
    };
  }
  return _atCfg;
}

function getClient(apiKey, username) {
  try {
    const AfricasTalking = require('africastalking');
    const at = AfricasTalking({ username, apiKey });
    return at.SMS;
  } catch (e) {
    return null;
  }
}

async function send({ phone, message, type = 'custom', user_id = null }) {
  // Validate
  if (!phone || !message) return { success: false, error: 'phone and message required' };

  // Log first (before send)
  const [logR] = await pool.query(
    'INSERT INTO sms_logs (user_id,phone,message,type,status) VALUES (?,?,?,?,?)',
    [user_id || null, phone, message, type, 'pending']
  );
  const log_id = logR.insertId;

  // Read credentials from DB (with env fallback)
  const creds = await getAtCredentials();

  if (!creds.enabled) {
    await pool.query('UPDATE sms_logs SET status=?,provider_ref=? WHERE id=?', ['sent', 'DISABLED_MODE', log_id]);
    return { success: true, ref: 'DISABLED_MODE' };
  }

  const hasRealCreds = creds.apiKey && creds.apiKey.length > 10 && creds.apiKey !== 'your_api_key'
    && creds.username && creds.username !== 'sandbox';

  if (!hasRealCreds) {
    await pool.query('UPDATE sms_logs SET status=?,provider_ref=?,sent_at=NOW() WHERE id=?', ['sent', 'DEMO_NO_CREDS', log_id]);
    return { success: true, ref: 'DEMO_NO_CREDS', demo: true };
  }

  const client = getClient(creds.apiKey, creds.username);
  if (!client) {
    await pool.query('UPDATE sms_logs SET status=? WHERE id=?', ['failed', log_id]);
    return { success: false, error: 'SMS client not available' };
  }

  try {
    const normalised = phone.replace(/^0/, '+254').replace(/^254/, '+254');
    const result = await client.send({
      to: [normalised],
      message,
      from: creds.senderId,
    });
    const ref = result.SMSMessageData?.Recipients?.[0]?.messageId || 'sent';
    const cost = parseFloat(result.SMSMessageData?.Recipients?.[0]?.cost?.replace('KES ', '') || 0);
    await pool.query('UPDATE sms_logs SET status=?,provider_ref=?,cost=?,sent_at=NOW() WHERE id=?', ['sent', ref, cost, log_id]);
    return { success: true, ref };
  } catch (e) {
    await pool.query('UPDATE sms_logs SET status=? WHERE id=?', ['failed', log_id]);
    // Only log the error once per hour to avoid spam in logs
    const now = Date.now();
    if (!global._lastSmsErrLog || now - global._lastSmsErrLog > 3600000) {
      console.error('SMS send error (further errors suppressed for 1h):', e.message);
      global._lastSmsErrLog = now;
    }
    return { success: false, error: e.message };
  }
}

// ── Template senders ─────────────────────────────────────────
async function sendPaymentReminder({ tenant_name, phone, amount, due_date, unit_number, user_id }) {
  return send({
    phone,
    message: `Dear ${tenant_name}, your rent of KES ${Number(amount).toLocaleString()} for unit ${unit_number} is due on ${due_date}. Pay via M-Pesa Paybill 400200, Acc: ${unit_number}. Smart Nyumba RMS.`,
    type: 'payment_reminder',
    user_id,
  });
}

async function sendReceiptSMS({ tenant_name, phone, amount, receipt_number, user_id }) {
  return send({
    phone,
    message: `Dear ${tenant_name}, we confirm receipt of KES ${Number(amount).toLocaleString()}. Receipt: ${receipt_number}. Thank you! Smart Nyumba RMS.`,
    type: 'receipt',
    user_id,
  });
}

async function sendWelcomeSMS({ tenant_name, phone, unit_number, property_name, user_id }) {
  return send({
    phone,
    message: `Welcome to ${property_name}, ${tenant_name.split(' ')[0]}! You are now registered in unit ${unit_number}. Download the Smart Nyumba Pro app to manage your account. Welcome!`,
    type: 'welcome',
    user_id,
  });
}

module.exports = { send, sendPaymentReminder, sendReceiptSMS, sendWelcomeSMS };
