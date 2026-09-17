'use strict';

const router = require('express').Router();
const auth   = require('../middleware/auth');
const { invoiceSchema, idParam } = require('../middleware/validators');
const auditMiddleware = require('../middleware/audit').auditMiddleware || require('../middleware/audit');
const c = require('../controllers/admin/invoices');

const ADMINS = ['super_admin', 'property_manager'];

router.get('/',                auth(),        c.getAll);
router.post('/',               auth(ADMINS),  invoiceSchema, auditMiddleware('CREATE_INVOICE', 'invoices'), c.create);
router.post('/bulk',           auth(ADMINS),  auditMiddleware('BULK_INVOICE', 'invoices'), c.bulkGenerate);

router.post('/remind-bulk', auth(ADMINS), async (req, res) => {
  const pool = require('../config/db');
  const sms  = require('../services/sms');
  try {
    const { property_id } = req.body;
    // SECURITY FIX: previously had no baseline org filter at all — with no
    // property_id supplied, this sent SMS reminders to every overdue
    // tenant across the ENTIRE PLATFORM, not just the caller's org, and
    // even with property_id there was no check it belonged to their org.
    let sql = `
      SELECT u.phone, u.full_name, un.unit_number, SUM(i.balance) AS owed
      FROM invoices i
      JOIN tenancies ten ON i.tenancy_id = ten.id
      JOIN tenants t ON ten.tenant_id = t.id
      JOIN users u ON t.user_id = u.id
      JOIN units un ON ten.unit_id = un.id
      JOIN properties pr ON un.property_id = pr.id
      WHERE i.status IN ('unpaid','overdue','partial') AND i.balance > 0 AND pr.org_id = ?`;
    const params = [req.user.org_id];
    if (req.user.role === 'property_manager') { sql += ' AND pr.manager_id=?'; params.push(req.user.sub); }
    if (property_id) { sql += ' AND pr.id = ?'; params.push(property_id); }
    sql += ' GROUP BY ten.id HAVING owed > 0 LIMIT 200';

    const [rows] = await pool.query(sql, params);
    let sent = 0, failed = 0;

    for (const r of rows) {
      if (!r.phone) { failed++; continue; }
      try {
        const msg = 'Dear ' + r.full_name + ', you have an outstanding balance of KES ' +
          Number(r.owed).toLocaleString() + ' for unit ' + r.unit_number +
          '. Please pay promptly to avoid penalties. SmartNyumba.';
        await sms.send({ phone: r.phone, message: msg, type: 'reminder' });
        sent++;
      } catch (_) { failed++; }
    }

    res.json({ sent, failed, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id',             auth(ADMINS),  idParam, auditMiddleware('UPDATE_INVOICE', 'invoices'), c.update);
router.put('/:id/overdue',     auth(ADMINS),  idParam, auditMiddleware('MARK_OVERDUE', 'invoices'), c.markOverdue);
router.post('/:id/waive-fee',  auth(['super_admin']), idParam, auditMiddleware('WAIVE_FEE', 'invoices'), c.waiveFee);


// ── Custom message + reversal ────────────────────────────────
const invCtrl = require('../controllers/admin/invoice_control');
router.post('/message',      auth(ADMINS), invCtrl.sendCustomMessage);
router.post('/reverse',      auth(ADMINS), invCtrl.reverseInvoices);
router.post('/reverse-bulk', auth(ADMINS), invCtrl.reverseBulk);

module.exports = router;
