const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/settings');
router.get('/',          auth(['super_admin']), c.getAll);
router.put('/',          auth(['super_admin']), c.update);
router.get('/alerts',    auth(), c.getAlerts);
router.post('/alerts',   auth(), c.createAlert);

// #13 — Test connection endpoints
router.post('/test-email', auth(['super_admin','property_manager']), async (req, res) => {
  const { ok, err } = require('../utils/helpers');
  try {
    const { sendEmail } = require('../services/email');
    const pool = require('../config/db');
    const [[u]] = await pool.query('SELECT email, full_name FROM users WHERE id=?', [req.user.sub]);
    if (!u?.email) return err(res, 'No email on your account to send test to', 400);
    await sendEmail({
      to: u.email,
      subject: '✅ SmartNyumba — Email test successful',
      html: `<p>Hi ${u.full_name},</p><p>Your SMTP settings are working correctly. This is a test email from SmartNyumba Pro.</p><p style="color:#64748b;font-size:12px">Sent ${new Date().toLocaleString('en-KE')}</p>`,
    });
    ok(res, { message: `Test email sent to ${u.email}` });
  } catch(e) { err(res, e.message, 500); }
});

router.post('/test-sms', auth(['super_admin','property_manager']), async (req, res) => {
  const { ok, err } = require('../utils/helpers');
  try {
    const { send } = require('../services/sms');
    const pool = require('../config/db');
    const [[u]] = await pool.query('SELECT phone, full_name FROM users WHERE id=?', [req.user.sub]);
    if (!u?.phone) return err(res, 'No phone number on your account to send test to', 400);
    const result = await send({
      phone: u.phone,
      message: `SmartNyumba Pro: SMS test successful. Hi ${u.full_name.split(' ')[0]}, your Africa's Talking credentials are working.`,
      type: 'test',
      user_id: req.user.sub,
    });
    if (!result.success) return err(res, result.error || 'SMS send failed', 500);
    ok(res, { message: `Test SMS sent to ${u.phone}` });
  } catch(e) { err(res, e.message, 500); }
});

// Public endpoint — returns only non-sensitive config needed by tenant portal
// BUG FIX: real columns are setting_key/setting_value, not key_name/value —
// this always threw ER_BAD_FIELD_ERROR, meaning the tenant-facing portal
// could never load the M-Pesa paybill/shortcode it needs to accept payments.
router.get('/public', async (req, res) => {
  const { ok, err } = require('../utils/helpers');
  try {
    const pool = require('../config/db');
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('mpesa_shortcode','system_name','currency')"
    );
    const s = rows.reduce((a,r) => { a[r.setting_key]=r.setting_value; return a; }, {});
    ok(res, s);
  } catch(e) { err(res, e.message, 500); }
});

module.exports = router;
