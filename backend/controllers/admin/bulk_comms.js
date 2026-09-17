// backend/controllers/admin/bulk_comms.js
// New endpoints:
//   POST /api/invoices/remind-bulk     — SMS all unpaid tenants
//   POST /api/announcements/sms-blast  — SMS all tenants in a property

const pool = require('../../config/db');
const { ok, err, safeErr } = require("../../utils/helpers");
const sms  = require('../../services/sms');
const wa   = require('../../services/whatsapp');

// ── Bulk SMS rent reminders ───────────────────────────────────
exports.remindBulk = async (req, res) => {
  try {
    const { property_id, message_override } = req.body;

    // SECURITY FIX: no org scoping at all — without an explicit
    // property_id, a property_manager on ANY organisation could trigger
    // an SMS blast to every unpaid tenant across the entire platform
    // (real SMS cost + privacy exposure for unrelated organisations).
    // An explicit property_id also wasn't checked against the caller's org.
    let pf = ' AND pr.org_id=?';
    const pp = [req.user.org_id];
    if (property_id) {
      const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
      if (!prop) return err(res, 'Property not found', 404);
      pf += ' AND un.property_id=?'; pp.push(property_id);
    }

    const [unpaid] = await pool.query(`
      SELECT DISTINCT u.full_name, u.phone, u.id AS user_id,
             i.balance, i.due_date, un.unit_number, pr.name AS property_name
      FROM invoices i
      JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN tenants t ON ten.tenant_id=t.id
      JOIN users u ON t.user_id=u.id
      JOIN units un ON ten.unit_id=un.id
      JOIN properties pr ON un.property_id=pr.id
      WHERE i.status IN('unpaid','overdue','partial') AND i.type='rent'${pf}
      ORDER BY i.balance DESC`, pp);

    if (!unpaid.length) return ok(res, { sent: 0, message: 'No unpaid tenants found' });

    let sent = 0, failed = 0;
    for (const t of unpaid) {
      if (!t.phone) { failed++; continue; }
      const msg = message_override ||
        `SmartNyumba: Dear ${t.full_name.split(' ')[0]}, your rent balance of KES ${Number(t.balance).toLocaleString()} for unit ${t.unit_number} is ${t.due_date < new Date().toISOString().slice(0,10) ? 'OVERDUE' : `due ${t.due_date}`}. Pay via M-Pesa to avoid penalties.`;

      const result = await sms.send({ phone: t.phone, user_id: t.user_id, type: 'bulk_reminder', message: msg });
      if (result.success) sent++; else failed++;
    }

    ok(res, { sent, failed, total: unpaid.length, message: `Sent ${sent} reminders` });
  } catch(e) { safeErr(res, e); }
};

// ── Bulk SMS announcement blast ───────────────────────────────
exports.announcementSmsBlast = async (req, res) => {
  try {
    const { property_id, message } = req.body;
    if (!message) return err(res, 'message is required');

    // SECURITY FIX: same missing-org-scope pattern as remindBulk() above
    // — this could blast an SMS announcement to every active tenant
    // across every organisation on the platform.
    let pf = 'AND pr.org_id=?';
    const pp = [req.user.org_id];
    if (property_id) {
      const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
      if (!prop) return err(res, 'Property not found', 404);
      pf += ' AND un.property_id=?'; pp.push(property_id);
    }

    const [tenants] = await pool.query(`
      SELECT DISTINCT u.full_name, u.phone, u.id AS user_id
      FROM tenancies ten
      JOIN tenants t ON ten.tenant_id=t.id
      JOIN users u ON t.user_id=u.id
      JOIN units un ON ten.unit_id=un.id
      JOIN properties pr ON un.property_id=pr.id
      WHERE ten.status='active' ${pf}`, pp);

    let sent = 0, failed = 0;
    for (const t of tenants) {
      if (!t.phone) { failed++; continue; }
      const result = await sms.send({
        phone: t.phone, user_id: t.user_id, type: 'announcement',
        message: `SmartNyumba Notice: ${message}`
      });
      if (result.success) sent++; else failed++;
    }

    ok(res, { sent, failed, total: tenants.length });
  } catch(e) { safeErr(res, e); }
};

// ── WhatsApp receipt after payment ───────────────────────────
// Call this from payments controller after a payment is recorded
exports.sendWhatsAppReceipt = async ({ tenant_name, phone, amount, unit_number, receipt_number, user_id }) => {
  try {
    const enabled = await pool.query("SELECT setting_value FROM settings WHERE setting_key='whatsapp_enabled'")
      .then(([[r]]) => r?.setting_value === '1').catch(() => false);
    if (!enabled) return;

    await wa.sendPaymentReceipt({ tenant_name, phone, amount, unit_number, receipt_number, user_id });
  } catch (_) {}
};