const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

// ── In-memory settings cache (60s TTL) ────────────────────────────────────
// Settings are read frequently (utility rates, invoice config, MPESA env etc).
// Caching avoids a DB round-trip on every request that checks settings.
let _settingsCache = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL = 60_000; // 60 seconds

async function getCachedSettings() {
  if (_settingsCache && Date.now() - _settingsCacheAt < SETTINGS_TTL) {
    return _settingsCache;
  }
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings ORDER BY setting_key');
  _settingsCache = Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
  _settingsCacheAt = Date.now();
  return _settingsCache;
}

function invalidateSettingsCache() {
  _settingsCache = null;
  _settingsCacheAt = 0;
}

module.exports.getCachedSettings = getCachedSettings;
module.exports.invalidateSettingsCache = invalidateSettingsCache;

exports.getAll = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settings ORDER BY setting_key');
    ok(res, { settings: Object.fromEntries(rows.map(r=>[r.setting_key,r.setting_value])) });
  } catch(e) { safeErr(res, e); }
};

exports.update = async (req, res) => {
  try {
    const settings = req.body;
    // Only save known, safe setting keys
    const ALLOWED = [
      'system_name','currency','auto_invoice_day','timezone',
      'mpesa_enabled','mpesa_stk_enabled','mpesa_stk_push',
      'mpesa_shortcode','mpesa_consumer_key','mpesa_consumer_secret',
      'mpesa_passkey','mpesa_callback_url','mpesa_env',
      'sms_enabled','at_username','at_api_key','at_sender_id',
      'whatsapp_enabled',
      'email_enabled','smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name',
      'late_fees_enabled','late_fee_percent','grace_period_days',
      'water_rate','electricity_rate',
    ];
    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED.includes(key)) continue; // skip unknown keys
      await pool.query(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, String(value ?? ''), String(value ?? '')]
      );
    }
    ok(res, { message: 'Settings updated' });
  } catch(e) { safeErr(res, e); }
};

exports.getAlerts = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT sa.*,u.full_name AS raised_by_name FROM system_alerts sa LEFT JOIN users u ON sa.raised_by=u.id ORDER BY sa.created_at DESC LIMIT 20');
    ok(res, { alerts: rows });
  } catch(e) { safeErr(res, e); }
};

exports.createAlert = async (req, res) => {
  try {
    const { title,message,severity,property_id } = req.body;
    if (!title||!message) return err(res, 'title and message required');
    const [r] = await pool.query('INSERT INTO system_alerts (property_id,title,message,severity,raised_by) VALUES (?,?,?,?,?)',
      [property_id||null, title, message, severity||'info', req.user.sub]);
    ok(res, { id: r.insertId }, 201);
  } catch(e) { safeErr(res, e); }
};
