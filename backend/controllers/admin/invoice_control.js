'use strict';
// Invoice control endpoints:
//   PATCH /api/tenancies/:id/billing-mode  — toggle auto/manual invoicing
//   POST  /api/invoices/message            — send custom message to tenant(s)
//   POST  /api/invoices/reverse            — reverse/void one or many invoices
//   POST  /api/invoices/reverse-bulk       — bulk reverse by property/tenant/all

const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');
const { notify } = require('./notifications');

// ── 1. Toggle billing mode ────────────────────────────────────
// PATCH /api/tenancies/:id/billing-mode
// body: { billing_mode: 'auto' | 'manual' }
exports.setBillingMode = async (req, res) => {
  try {
    const { billing_mode } = req.body;
    if (!['auto','manual'].includes(billing_mode))
      return err(res, "billing_mode must be 'auto' or 'manual'");

    const [[ten]] = await pool.query('SELECT id,tenant_id FROM tenancies WHERE id=? AND COALESCE(org_id,1)=COALESCE(?,1)', [req.params.id, req.user?.org_id||1]);
    if (!ten) return err(res, 'Tenancy not found', 404);

    await pool.query('UPDATE tenancies SET billing_mode=? WHERE id=?', [billing_mode, req.params.id]);
    ok(res, { message: `Billing mode set to ${billing_mode}`, billing_mode });
  } catch(e) { safeErr(res, e); }
};

// ── 2. Send custom message to tenant(s) ──────────────────────
// POST /api/invoices/message
// body: { tenancy_ids: [1,2,3] | 'all', property_id?, message, subject?, channel: 'sms'|'email'|'both'|'notification' }
exports.sendCustomMessage = async (req, res) => {
  try {
    const { tenancy_ids, property_id, message, subject, channel = 'notification' } = req.body;
    if (!message?.trim()) return err(res, 'Message is required');

    // Build recipient list
    let sql = `
      SELECT DISTINCT tu.id AS user_id, tu.full_name, tu.phone, tu.email,
        un.unit_number, p.name AS property_name, ten.id AS tenancy_id
      FROM tenancies ten
      JOIN tenants t ON ten.tenant_id = t.id
      JOIN users tu ON t.user_id = tu.id
      JOIN units un ON ten.unit_id = un.id
      JOIN properties p ON un.property_id = p.id
      WHERE ten.status IN ('active','approved') AND p.org_id = ?`;
    // SECURITY FIX: no org scoping — a super_admin could message tenants
    // belonging to a different organisation by passing their tenancy_ids
    // or property_id.
    const params = [req.user.org_id];

    if (Array.isArray(tenancy_ids) && tenancy_ids.length) {
      sql += ` AND ten.id IN (${tenancy_ids.map(()=>'?').join(',')})`;
      params.push(...tenancy_ids);
    } else if (property_id) {
      sql += ' AND p.id = ?';
      params.push(property_id);
    }
    // scope to manager's properties
    if (req.user.role === 'property_manager') {
      sql += ' AND p.manager_id = ?';
      params.push(req.user.sub);
    }

    const [recipients] = await pool.query(sql, params);
    if (!recipients.length) return err(res, 'No active tenants found for given filters');

    const sms   = channel === 'sms'   || channel === 'both' ? require('../../services/sms')   : null;
    const email = channel === 'email' || channel === 'both' ? require('../../services/email') : null;

    let sent = 0, failed = 0;
    for (const r of recipients) {
      try {
        // In-app notification always
        await notify(pool, {
          user_id: r.user_id, type: 'message',
          title: subject || 'Message from management',
          message: message,
          action_url: '/messages',
        });
        // SMS
        if (sms && r.phone) {
          await sms.send({ phone: r.phone, message: `${subject ? subject+': ' : ''}${message}`, type: 'custom' });
        }
        // Email
        if (email && r.email) {
          await email.sendGeneral?.({ to: r.email, subject: subject || 'Message from management', body: message })
            .catch(() => {});
        }
        sent++;
      } catch (_) { failed++; }
    }

    ok(res, { sent, failed, total: recipients.length });
  } catch(e) { safeErr(res, e); }
};

// ── 3. Reverse / void invoices ────────────────────────────────
// POST /api/invoices/reverse
// body: { invoice_ids: [1,2,3], reason, create_credit_note: true }
exports.reverseInvoices = async (req, res) => {
  const { invoice_ids, reason, create_credit_note = true } = req.body;
  if (!Array.isArray(invoice_ids) || !invoice_ids.length)
    return err(res, 'invoice_ids array required');

  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const reversed = [], skipped = [];

    for (const invId of invoice_ids) {
      // SECURITY FIX: no org check at all — any property_manager (this
      // route is open to property_manager, not just super_admin) could
      // cancel/reverse ANY organisation's invoice by ID, and even create
      // a credit note crediting an unrelated tenant's ledger. Scoped the
      // lookup through the tenancy → unit → property chain to org_id.
      const [[inv]] = await conn.query(
        `SELECT i.* FROM invoices i
         JOIN tenancies ten ON i.tenancy_id = ten.id
         JOIN units u ON ten.unit_id = u.id
         JOIN properties p ON u.property_id = p.id
         WHERE i.id=? AND p.org_id=?`, [invId, req.user.org_id]);
      if (!inv) { skipped.push({ id: invId, reason: 'not found' }); continue; }
      if (inv.status === 'paid') { skipped.push({ id: invId, reason: 'already paid — void not allowed; use credit note' }); continue; }
      if (['cancelled','waived','reversed'].includes(inv.status)) {
        skipped.push({ id: invId, reason: `already ${inv.status}` }); continue;
      }

      // Mark invoice as cancelled/reversed
      await conn.query(
        `UPDATE invoices SET status='cancelled', balance=0,
           notes=CONCAT(IFNULL(notes,''),'\n[REVERSED ${new Date().toISOString().split('T')[0]}] ${reason || 'Reversed by admin'}')
         WHERE id=?`, [invId]);

      // Ledger credit entry
      await conn.query(
        `INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id)
         VALUES (?,?,?,?,?,?)`,
        [inv.tenancy_id, 'credit', inv.amount,
         `Invoice #${invId} reversed: ${reason || 'Admin reversal'}`,
         'reversal', invId]);

      // Optional credit note (new invoice with negative amount to offset)
      if (create_credit_note) {
        // BUG FIX: same missing org_id as the other INSERT INTO invoices
        // call sites found in this pass — inv.org_id is already available
        // (SELECT i.* above) and already verified to match req.user.org_id.
        const [cn] = await conn.query(
          `INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,status,notes,parent_invoice_id,org_id)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [inv.tenancy_id, inv.type, -inv.amount, 0,
           new Date().toISOString().split('T')[0],
           'waived',
           `Credit note — reversal of invoice #${invId}: ${reason || 'Admin reversal'}`,
           invId, inv.org_id]);
        reversed.push({ invoice_id: invId, credit_note_id: cn.insertId });
      } else {
        reversed.push({ invoice_id: invId });
      }

      // Notify tenant
      const [[ten]] = await conn.query(
        `SELECT tu.id AS user_id FROM tenancies ten
         JOIN tenants t ON ten.tenant_id=t.id
         JOIN users tu ON t.user_id=tu.id
         WHERE ten.id=?`, [inv.tenancy_id]);
      if (ten) {
        await notify(conn, {
          user_id: ten.user_id, type: 'invoice',
          title: `Invoice #${invId} reversed`,
          message: `Invoice of KES ${Number(inv.amount).toLocaleString()} has been reversed. ${reason ? 'Reason: '+reason : ''}`,
          action_url: '/tenant/invoices',
        }).catch(() => {});
      }
    }

    await conn.commit();
    conn.release();
    ok(res, { reversed, skipped, message: `${reversed.length} invoice(s) reversed, ${skipped.length} skipped` });
  } catch (e) {
    await conn.rollback();
    conn.release();
    err(res, e.message, 500);
  }
};

// ── 4. Bulk reverse — by filter ───────────────────────────────
// POST /api/invoices/reverse-bulk
// body: { filter: 'property'|'tenant'|'tenancy'|'type'|'month',
//         property_id?, tenant_id?, tenancy_id?, type?, month_year?,
//         reason, create_credit_note, status_filter: 'unpaid'|'overdue'|'all' }
exports.reverseBulk = async (req, res) => {
  const { filter, property_id, tenant_id, tenancy_id, type, month_year,
          reason, create_credit_note = true,
          status_filter = 'unpaid' } = req.body;

  try {
    let sql = `SELECT i.id FROM invoices i
      JOIN tenancies ten ON i.tenancy_id = ten.id
      JOIN units u ON ten.unit_id = u.id
      JOIN properties p ON u.property_id = p.id
      JOIN tenants t ON ten.tenant_id = t.id
      WHERE p.org_id = ?`;
    // SECURITY FIX: had no org scoping at all — a property_manager or
    // super_admin could pass a property_id/tenant_id/tenancy_id
    // belonging to a completely different organisation and bulk-reverse
    // (and credit-note) their invoices.
    const params = [req.user.org_id];

    // Status filter
    if (status_filter === 'all') {
      sql += " AND i.status NOT IN ('cancelled','waived','reversed')";
    } else {
      const statuses = status_filter === 'overdue' ? ['overdue'] : ['unpaid','overdue','partial'];
      sql += ` AND i.status IN (${statuses.map(()=>'?').join(',')})`;
      params.push(...statuses);
    }

    // Scope filters
    if (property_id) { sql += ' AND p.id=?';         params.push(property_id); }
    if (tenancy_id)  { sql += ' AND i.tenancy_id=?'; params.push(tenancy_id); }
    if (tenant_id)   { sql += ' AND t.id=?';          params.push(tenant_id); }
    if (type)        { sql += ' AND i.type=?';         params.push(type); }
    if (month_year)  { sql += ' AND i.month_year=?';   params.push(month_year); }

    // Manager scope
    if (req.user.role === 'property_manager') {
      sql += ' AND p.manager_id=?'; params.push(req.user.sub);
    }

    sql += ' LIMIT 500'; // safety cap

    const [rows] = await pool.query(sql, params);
    if (!rows.length) return err(res, 'No matching invoices found for the given filters');

    // Delegate to reverseInvoices logic
    req.body.invoice_ids = rows.map(r => r.id);
    return exports.reverseInvoices(req, res);
  } catch(e) { safeErr(res, e); }
};
