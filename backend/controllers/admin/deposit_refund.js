// backend/controllers/admin/deposit_refund.js
// New endpoints for deposit refund workflow:
//   GET  /api/tenancies/:id/deposit-summary
//   POST /api/tenancies/:id/deposit-refund    — create refund record
//   PUT  /api/deposit-refunds/:id             — update status to 'paid'

const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');
const { notify } = require('./notifications');

// ── Get deposit summary for a tenancy ────────────────────────
exports.getDepositSummary = async (req, res) => {
  try {
    // SECURITY FIX: previously WHERE ten.id=? with no org check — anyone
    // could pull another organisation's tenant's deposit summary.
    const [[ten]] = await pool.query(`
      SELECT ten.*,
             u.full_name AS tenant_name, u.phone, u.id AS user_id,
             un.unit_number, pr.name AS property_name
      FROM tenancies ten
      JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
      JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
      WHERE ten.id=? AND ten.org_id=?`, [req.params.id, req.user.org_id]);

    if (!ten) return err(res, 'Tenancy not found', 404);

    // Existing refund record if any
    const [[refund]] = await pool.query(
      'SELECT * FROM deposit_refunds WHERE tenancy_id=? ORDER BY created_at DESC LIMIT 1',
      [req.params.id]).catch(() => [[null]]);

    // Total payments already made by tenant
    const [[payments]] = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS total_paid FROM payments WHERE tenancy_id=?',
      [req.params.id]);

    ok(res, {
      tenancy: ten,
      deposit_held:   Number(ten.deposit) || 0,
      total_paid:     Number(payments.total_paid) || 0,
      refund_record:  refund || null,
    });
  } catch(e) { safeErr(res, e); }
};

// ── Create deposit refund ─────────────────────────────────────
exports.createRefund = async (req, res) => {
  try {
    const { deductions, notes } = req.body;
    // deductions: [{ description, amount }, ...]

    // SECURITY FIX: previously WHERE ten.id=? with no org check — anyone
    // could create a deposit-refund record (which credits money to a
    // tenant_ledger) against another organisation's tenancy.
    const [[ten]] = await pool.query(`
      SELECT ten.*,u.full_name AS tenant_name,u.phone,u.id AS user_id,un.unit_number
      FROM tenancies ten
      JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
      JOIN units un ON ten.unit_id=un.id
      WHERE ten.id=? AND ten.org_id=?`, [req.params.id, req.user.org_id]);

    if (!ten) return err(res, 'Tenancy not found', 404);

    const deposit  = Number(ten.deposit) || 0;
    const totalDed = (deductions || []).reduce((s, d) => s + Number(d.amount), 0);
    const netRefund = Math.max(0, deposit - totalDed);

    // Check if refund already exists
    const [[existing]] = await pool.query(
      "SELECT id FROM deposit_refunds WHERE tenancy_id=? AND status != 'cancelled'",
      [req.params.id]).catch(() => [[null]]);
    if (existing) return err(res, 'A refund record already exists for this tenancy', 409);

    const [r] = await pool.query(
      `INSERT INTO deposit_refunds
       (tenancy_id,gross_deposit,deductions,net_refund,reason,status,processed_by)
       VALUES (?,?,?,?,?,?,?)`,
      [req.params.id, deposit, JSON.stringify(deductions || []),
       netRefund, notes || null, 'pending', req.user.sub]);

    // Record deposit refund in tenant_ledger (not payments — no invoice needed)
    if (netRefund > 0) {
      await pool.query(
        'INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
        [req.params.id, 'credit', netRefund, 'Deposit refund', 'deposit_refund', r.insertId]
      ).catch(() => {});
    }

    // Notify tenant
    if (ten.user_id) {
      await notify(pool, {
        user_id: ten.user_id, type: 'deposit_refund',
        title: 'Deposit refund processed',
        message: `Your deposit refund of KES ${netRefund.toLocaleString()} has been processed. Net refund after deductions of KES ${totalDed.toLocaleString()}.`,
        action_url: '/tenant/statement'
      });
    }

    ok(res, { id: r.insertId, net_refund: netRefund, message: 'Deposit refund created' }, 201);
  } catch(e) { safeErr(res, e); }
};

// ── Mark refund as paid ───────────────────────────────────────
exports.markRefundPaid = async (req, res) => {
  try {
    const { payment_reference } = req.body;
    // SECURITY FIX: previously ran unconditionally with NO ownership
    // check at all — anyone could mark any deposit refund in the entire
    // system as paid, by ID. deposit_refunds has no org_id column of its
    // own, so ownership is verified via a JOIN through its tenancy.
    const [r] = await pool.query(
      `UPDATE deposit_refunds dr
       JOIN tenancies ten ON dr.tenancy_id = ten.id
       SET dr.status='paid', dr.payment_reference=?, dr.paid_at=NOW()
       WHERE dr.id=? AND ten.org_id=?`,
      [payment_reference || null, req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'Deposit refund not found', 404);
    ok(res, { message: 'Deposit refund marked as paid' });
  } catch(e) { safeErr(res, e); }
};