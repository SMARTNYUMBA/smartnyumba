// FIXED: controllers/admin/payments.js
// Fixes applied:
//   1. Removed duplicate conn.commit() + conn.release() (was crashing every payment)
//   2. Replaced race-prone receiptNumber(pool) with atomic nextReceiptNumber(conn)
//   3. Used safeErr for consistent error handling

const pool = require('../../config/db');
const { ok, err, safeErr, nextReceiptNumber } = require('../../utils/helpers');

function validateMpesaCode(code) {
  if (!code) return null;
  if (!/^[A-Z0-9]{10}$/.test(code)) return 'M-Pesa code must be exactly 10 alphanumeric characters';
  return null;
}

exports.getAll = async (req, res) => {
  try {
    let sql = `SELECT py.*,i.type AS invoice_type,u.full_name AS tenant_name,
      un.unit_number,pr.name AS property_name,rc.receipt_number
      FROM payments py JOIN invoices i ON py.invoice_id=i.id
      JOIN tenancies ten ON py.tenancy_id=ten.id JOIN tenants t ON ten.tenant_id=t.id
      JOIN users u ON t.user_id=u.id JOIN units un ON ten.unit_id=un.id
      JOIN properties pr ON un.property_id=pr.id
      LEFT JOIN receipts rc ON py.id=rc.payment_id WHERE py.org_id=?`;
    // SECURITY FIX: no org filter at all previously — any authenticated
    // user could list every payment recorded across every organisation.
    const params = [req.user.org_id];
    if (req.query.tenancy_id)  { sql += ' AND py.tenancy_id=?';  params.push(req.query.tenancy_id); }
    if (req.query.property_id) { sql += ' AND pr.id=?';           params.push(req.query.property_id); }
    if (req.query.tenant_id)   { sql += ' AND ten.tenant_id=?';   params.push(req.query.tenant_id); }
    if (req.user.role === 'property_manager') {
      sql += ' AND pr.manager_id=?'; params.push(req.user.sub);
    } else if (['caretaker','security'].includes(req.user.role) && req.user.property_id) {
      sql += ' AND pr.id=?'; params.push(req.user.property_id);
    }
    if (req.query.date_from) { sql += ' AND DATE(py.paid_at) >= ?'; params.push(req.query.date_from); }
    if (req.query.date_to)   { sql += ' AND DATE(py.paid_at) <= ?'; params.push(req.query.date_to); }
    // SECURITY FIX: property_manager and caretaker/security both had
    // their own scoping branch above, but 'tenant' had none at all —
    // and this route (routes/payments.js) allows any authenticated
    // role, tenant included, with no query params required. A tenant
    // calling GET /payments with no filters got every payment recorded
    // across their entire organisation: other tenants' amounts,
    // transaction codes, unit numbers, names — not just their own.
    if (req.user.role === 'tenant') {
      sql += ' AND ten.tenant_id=(SELECT id FROM tenants WHERE user_id=?)';
      params.push(req.user.sub);
    }
    sql += ' ORDER BY py.paid_at DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    const total_amount = rows.reduce((s,r) => s + Number(r.amount), 0);
    ok(res, { payments: rows, total_amount });
  } catch(e) { safeErr(res, e); }  // FIX: was err(res, e.message, 500) — use safeErr
};

exports.record = async (req, res) => {
  try {
    let { invoice_id, tenancy_id, amount, payment_method, transaction_code, mpesa_phone, notes } = req.body;
    if (!invoice_id||!tenancy_id||!amount||!payment_method)
      return err(res, 'invoice_id, tenancy_id, amount and payment_method required');

    if (req.user.role === 'tenant' && payment_method === 'cash')
      return err(res, 'Cash payments not available on tenant portal. Use M-Pesa or bank transfer.', 403);

    if (transaction_code) transaction_code = transaction_code.toUpperCase().trim();

    if (payment_method === 'mpesa' && transaction_code) {
      const mpesaErr = validateMpesaCode(transaction_code);
      if (mpesaErr) return err(res, mpesaErr);
    }

    if (transaction_code) {
      const [[dup]] = await pool.query('SELECT id FROM payments WHERE transaction_code=?', [transaction_code]);
      if (dup) return err(res, `Transaction code ${transaction_code} already recorded`, 409);
    }

    // SECURITY FIX: invoice_id and tenancy_id came straight from the
    // request body and were never checked against each other or against
    // the caller's organisation. Previously you could record a "payment"
    // against any invoice/tenancy ID in the entire system, including
    // another organisation's — corrupting their balances and ledger.
    const [[invCheck]] = await pool.query(
      'SELECT id FROM invoices WHERE id=? AND tenancy_id=? AND org_id=?',
      [invoice_id, tenancy_id, req.user.org_id]);
    if (!invCheck) return err(res, 'Invoice not found for this tenancy', 404);

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const [pr] = await conn.query(
        'INSERT INTO payments (invoice_id,tenancy_id,amount,payment_method,transaction_code,mpesa_phone,notes,recorded_by,org_id) VALUES (?,?,?,?,?,?,?,?,?)',
        [invoice_id, tenancy_id, amount, payment_method, transaction_code||null, mpesa_phone||null, notes||null, req.user.sub, req.user.org_id]);

      // FIX: use atomic nextReceiptNumber(conn) inside the transaction, not the racy receiptNumber(pool)
      const rnum = await nextReceiptNumber(conn);

      await conn.query('INSERT INTO receipts (payment_id,receipt_number) VALUES (?,?)', [pr.insertId, rnum]);
      const [[inv]] = await conn.query('SELECT * FROM invoices WHERE id=? AND org_id=?', [invoice_id, req.user.org_id]);
      const remaining = Math.max(0, parseFloat(inv.balance) - parseFloat(amount));
      await conn.query('UPDATE invoices SET balance=?,status=? WHERE id=?',
        [remaining, remaining<=0?'paid':'partial', invoice_id]);
      await conn.query('INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
        [tenancy_id,'credit',amount,`${payment_method.toUpperCase()} ${transaction_code||''}`.trim(),'payment',pr.insertId]);

      // FIX: commit and release exactly ONCE
      const paymentId = pr.insertId;
      await conn.commit();
      conn.release();

      // Post-commit: send receipt (non-fatal)
      setImmediate(async () => {
        try {
          // FEATURE: fire payment.received for org webhook subscribers.
          // deliverEvent() existed fully built (retry/backoff/signing)
          // but was never actually called from anywhere in the app — no
          // webhook subscriber has ever received a real event.
          require('../../services/webhooks').deliverEvent('payment.received', {
            payment_id: paymentId, invoice_id, tenancy_id, amount: Number(amount),
            payment_method, transaction_code: transaction_code || null,
            receipt_number: rnum,
          }, req.user.org_id);
          const [[tenantInfo]] = await pool.query(
            `SELECT u.email, u.phone, u.full_name, u.id AS user_id,
                    un.unit_number, pr2.name AS property_name
             FROM tenancies ten
             JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
             JOIN units un ON ten.unit_id=un.id JOIN properties pr2 ON un.property_id=pr2.id
             WHERE ten.id=? LIMIT 1`, [tenancy_id]);
          if (tenantInfo) {
            await pool.query('INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
              [tenantInfo.user_id, 'payment', '✅ Payment received',
               'Payment of KES ' + Number(amount).toLocaleString() + ' received. Receipt: ' + rnum,
               '/tenant/payments']).catch(()=>{});
            const emailSvc = require('../../services/email');
            if (tenantInfo.email) {
              await emailSvc.sendPaymentReceipt({
                to: tenantInfo.email,
                tenant_name: tenantInfo.full_name,
                receipt_number: rnum,
                amount, payment_method, transaction_code,
                unit_number: tenantInfo.unit_number,
                property_name: tenantInfo.property_name,
              }).catch(()=>{});
            }
            const wa = require('../../services/whatsapp');
            if (tenantInfo.phone) {
              const msg = 'SmartNyumba receipt ' + rnum + ': Payment of KES ' +
                Number(amount).toLocaleString() + ' for unit ' + tenantInfo.unit_number +
                ' received via ' + payment_method.toUpperCase() +
                (transaction_code ? ' (' + transaction_code + ')' : '') + '. Thank you!';
              await wa.send({ phone: tenantInfo.phone, message: msg, type: 'receipt', user_id: tenantInfo.user_id }).catch(()=>{});
            }
          }
        } catch (_) {}
      });

      return ok(res, { payment_id: paymentId, receipt_number: rnum, message: 'Payment recorded' }, 201);
    } catch(e2) { await conn.rollback(); conn.release(); throw e2; }
  } catch(e) { safeErr(res, e); }
};

// Initiate M-Pesa STK Push for tenant
exports.initiateStk = async (req, res) => {
  try {
    const { invoice_id, amount, phone } = req.body;
    if (!invoice_id||!amount||!phone) return err(res, 'invoice_id, amount and phone required');
    // SECURITY FIX: no check that this invoice/tenancy belongs to the
    // caller's organisation before initiating a payment against it.
    // CONSOLIDATION: this used to only check org_id (or org_id+tenancy_id
    // if the caller supplied one) — a property_manager could target any
    // invoice anywhere in their org, not just properties they actually
    // manage. This is now the one canonical STK-initiation implementation
    // (routes/mpesa.js and controllers/admin/mpesaStk.js#initiate both
    // delegate here instead of keeping their own copies of this check),
    // so it uses the more precise role-based scoping that used to only
    // exist in routes/mpesa.js's copy: tenant → their own tenancy only,
    // property_manager → properties they manage, super_admin → org-wide.
    let scopeSql = 'SELECT id, tenancy_id, balance FROM invoices WHERE id=? AND org_id=?';
    const scopeParams = [invoice_id, req.user.org_id];
    if (req.user.role === 'tenant') {
      scopeSql += ` AND tenancy_id IN (
        SELECT ten.id FROM tenancies ten JOIN tenants t ON ten.tenant_id=t.id WHERE t.user_id=?
      )`;
      scopeParams.push(req.user.sub);
    } else if (req.user.role === 'property_manager') {
      scopeSql += ` AND tenancy_id IN (
        SELECT ten.id FROM tenancies ten JOIN units u ON ten.unit_id=u.id
        JOIN properties p ON u.property_id=p.id WHERE p.manager_id=?
      )`;
      scopeParams.push(req.user.sub);
    } else if (req.user.role === 'owner') {
      scopeSql += ` AND tenancy_id IN (
        SELECT ten.id FROM tenancies ten JOIN units u ON ten.unit_id=u.id
        JOIN properties p ON u.property_id=p.id WHERE p.owner_id=?
      )`;
      scopeParams.push(req.user.sub);
    }
    const [[invCheck]] = await pool.query(scopeSql, scopeParams);
    if (!invCheck) return err(res, 'Invoice not found', 404);

    const requestedAmount = parseFloat(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) return err(res, 'Invalid amount');
    if (requestedAmount > parseFloat(invCheck.balance) + 0.01) {
      return err(res, `Amount exceeds the outstanding balance of ${invCheck.balance}`);
    }

    const mpesa = require('../../services/mpesa');
    const result = await mpesa.stkPush({
      phone, amount: requestedAmount, invoice_id,
      tenancy_id: invCheck.tenancy_id, // derived, not trusted from the client
      account_ref: `SNP-${invCheck.tenancy_id}`,
    });
    if (result.success) ok(res, result);
    else err(res, result.error, 400);
  } catch(e) { safeErr(res, e); }
};

// Poll STK status
exports.checkStk = async (req, res) => {
  try {
    // BUG FIX: was `SELECT *` followed by `new Date(txn.created_at)` in JS
    // to compute elapsed time. A DB datetime string like
    // "2026-01-08 20:02:40" has no timezone marker, so JS's Date parser
    // treats it as LOCAL time — meaning the exact same stored value
    // produces a DIFFERENT elapsed-time result depending on the timezone
    // of whatever machine happens to be running this code (UTC: correct
    // by accident; any other offset, e.g. Africa/Nairobi in production:
    // wrong by that offset, every time). Computing the diff in SQL via
    // TIMESTAMPDIFF keeps both sides of the comparison in MySQL's own
    // session timezone, which is consistent regardless of what timezone
    // the Node process itself is running in.
    const [[txn]] = await pool.query(
      'SELECT *, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed_seconds FROM mpesa_transactions WHERE checkout_request_id=?',
      [req.params.checkout_id]
    );
    if (!txn) return err(res, 'Transaction not found', 404);

    // SECURITY: mpesa_transactions has no org_id column, so ownership is
    // derived via the invoice it's paying. checkout_request_id is a long
    // unguessable string (lower practical risk than a sequential ID), but
    // still worth confirming the caller's org actually owns this invoice.
    const [[ownerCheck]] = await pool.query('SELECT org_id FROM invoices WHERE id=?', [txn.invoice_id]);
    if (!ownerCheck || ownerCheck.org_id !== req.user.org_id) return err(res, 'Transaction not found', 404);

    if ((txn.checkout_request_id?.startsWith('DEMO') || txn.checkout_request_id?.startsWith('SIM_')) && txn.status === 'pending') {
      const elapsed = (txn.elapsed_seconds ?? 0) * 1000;
      if (elapsed > 5000) {
        // Atomically claim this transaction before crediting it — guards against two
        // near-simultaneous polls both reading status='pending' and both inserting a
        // duplicate payment (a race, not just a replay, since no webhook is involved here).
        const [claim] = await pool.query(
          "UPDATE mpesa_transactions SET status='completed' WHERE id=? AND status='pending'", [txn.id]);
        if (claim.affectedRows === 0) {
          // Another concurrent request already claimed it — just report current status.
          const [[fresh]] = await pool.query('SELECT status,transaction_code,result_desc FROM mpesa_transactions WHERE id=?', [txn.id]);
          return ok(res, { status: fresh.status, transaction_code: fresh.transaction_code, result_desc: fresh.result_desc });
        }
        const fakeCode = 'QK' + Math.random().toString(36).slice(2,10).toUpperCase().slice(0,8);
        await pool.query("UPDATE mpesa_transactions SET transaction_code=? WHERE id=?", [fakeCode, txn.id]);
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
          // mpesa_transactions has no org_id column of its own, so derive
          // it from the invoice being paid — needed to stamp the new
          // payment row correctly instead of letting it default to org 1.
          const [[inv]] = await conn.query('SELECT * FROM invoices WHERE id=?', [txn.invoice_id]);
          const [pr] = await conn.query('INSERT INTO payments (invoice_id,tenancy_id,amount,payment_method,transaction_code,mpesa_phone,notes,org_id) VALUES (?,?,?,?,?,?,?,?)',
            [txn.invoice_id, txn.tenancy_id, txn.amount, 'mpesa', fakeCode, txn.phone, 'M-Pesa STK Push', inv?.org_id || 1]);
          const rnum = await nextReceiptNumber(conn); // FIX: atomic receipt number
          await conn.query('INSERT INTO receipts (payment_id,receipt_number) VALUES (?,?)', [pr.insertId, rnum]);
          const remaining = Math.max(0, parseFloat(inv.balance) - parseFloat(txn.amount));
          await conn.query('UPDATE invoices SET balance=?,status=? WHERE id=?', [remaining, remaining<=0?'paid':'partial', txn.invoice_id]);
          await conn.commit();
          conn.release();
          // FEATURE: fire payment.received for org webhook subscribers
          // (see controllers/admin/payments.js#record for context — this
          // is the M-Pesa STK completion path, the other place a payment
          // actually gets created).
          require('../../services/webhooks').deliverEvent('payment.received', {
            payment_id: pr.insertId, invoice_id: txn.invoice_id, tenancy_id: txn.tenancy_id,
            amount: Number(txn.amount), payment_method: 'mpesa', transaction_code: fakeCode,
            receipt_number: rnum,
          }, inv?.org_id || req.user.org_id);
          // BUG FIX: pages/tenant/Payments.jsx stores this whole response
          // as payResult and then links to /pdf/receipt/${payResult.id} —
          // but this never returned an id (payment_id), only
          // receipt_number, and the PDF route needs the payment's id
          // (routes/pdf.js: GET /receipt/:payment_id). "Download receipt"
          // always pointed at /pdf/receipt/undefined.
          return ok(res, { status:'completed', id: pr.insertId, transaction_code:fakeCode, receipt_number:rnum, message:'Payment confirmed!' });
        } catch(e2) { await conn.rollback(); conn.release(); throw e2; }
      }
    }

    // BUG FIX: for a real (non-demo) completed M-Pesa payment, this never
    // returned a payment id — mpesa_transactions has no payment_id column
    // linking back to the row the webhook (services/mpesa.js#handleCallback)
    // creates in `payments`. pages/tenant/Payments.jsx needs payResult.id
    // to build the receipt PDF link (/pdf/receipt/:payment_id) after a
    // successful payment; without it, "Download receipt" always pointed
    // at /pdf/receipt/undefined for every real payment (the demo/simulated
    // path above was fixed the same way). transaction_code is the M-Pesa
    // receipt code and is written to both tables, so it's a safe join key.
    let paymentId = null;
    if (txn.status === 'completed' && txn.transaction_code) {
      const [[py]] = await pool.query(
        'SELECT id FROM payments WHERE transaction_code=? AND invoice_id=? LIMIT 1',
        [txn.transaction_code, txn.invoice_id]).catch(() => [[null]]);
      paymentId = py?.id || null;
    }
    ok(res, { status: txn.status, id: paymentId, transaction_code: txn.transaction_code, result_desc: txn.result_desc });
  } catch(e) { safeErr(res, e); }
};