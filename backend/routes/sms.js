const router = require('express').Router();
const auth   = require('../middleware/auth');
const sms    = require('../services/sms');
const pool   = require('../config/db');
const { ok, err } = require('../utils/helpers');

// Send custom SMS
router.post('/', auth(['super_admin','property_manager']), async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return err(res, 'phone and message required');
    const result = await sms.send({ phone, message, type:'custom', user_id: req.user.sub });
    ok(res, result);
  } catch (e) { err(res, e.message, 500); }
});

// Bulk payment reminders
// SECURITY FIX: previously had no org_id filter at all — a property_manager
// (not just super_admin) could trigger this and it would pull EVERY overdue
// invoice across the ENTIRE PLATFORM, sending SMS reminders to other
// organisations' tenants using this org's SMS send. Scoped to the caller's
// org, and further to their own managed properties when they're a manager.
router.post('/reminders', auth(['super_admin','property_manager']), async (req, res) => {
  try {
    let sql = `
      SELECT u.full_name,u.phone,ten.rent_amount,un.unit_number,MIN(i.due_date) oldest
      FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
      JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
      WHERE i.status IN('unpaid','overdue') AND u.phone IS NOT NULL AND ten.org_id=?`;
    const params = [req.user.org_id];
    if (req.user.role === 'property_manager') { sql += ' AND pr.manager_id=?'; params.push(req.user.sub); }
    sql += ' GROUP BY ten.id';
    const [overdue] = await pool.query(sql, params);
    let sent = 0;
    for (const t of overdue) {
      const r = await sms.sendPaymentReminder({ tenant_name: t.full_name, phone: t.phone, amount: t.rent_amount, due_date: t.oldest, unit_number: t.unit_number });
      if (r.success) sent++;
    }
    ok(res, { sent, total: overdue.length, message: `${sent} reminders sent` });
  } catch (e) { err(res, e.message, 500); }
});

// SMS logs
// SECURITY FIX: previously had no scoping at all — any property_manager
// could see the 50 most recent SMS logs (phone numbers + message content)
// across the entire platform, not just their own organisation's tenants.
// sms_logs has no org_id column of its own, so scope via the linked user.
router.get('/logs', auth(['super_admin','property_manager']), async (req, res) => {
  try {
    let sql = 'SELECT sl.* FROM sms_logs sl';
    const params = [];
    if (req.user.role !== 'super_admin') {
      sql += ' JOIN users u ON sl.user_id=u.id WHERE u.org_id=?';
      params.push(req.user.org_id);
    }
    sql += ' ORDER BY sl.created_at DESC LIMIT 50';
    const [rows] = await pool.query(sql, params);
    ok(res, { logs: rows });
  } catch (e) { err(res, e.message, 500); }
});

module.exports = router;
