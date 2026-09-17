const axios = require('axios');
const pool  = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

async function getDarajaToken() {
  const env = process.env.MPESA_ENV || 'sandbox';
  const url = env === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const creds = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const { data } = await axios.get(url, { headers: { Authorization: `Basic ${creds}` } });
  return data.access_token;
}

function generatePassword() {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g,'').slice(0,14);
  const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  return { password, timestamp };
}

// Initiate STK Push
exports.initiate = async (req, res) => {
  try {
    let { invoice_id, amount, phone } = req.body;
    if (!invoice_id || !amount || !phone) return err(res, 'invoice_id, amount and phone required');

    // Normalise phone
    phone = phone.replace(/^0/, '254').replace(/^\+/, '').replace(/\s/g,'');
    if (!/^254\d{9}$/.test(phone)) return err(res, 'Invalid phone number. Use format: 07XX XXX XXX');

    // SECURITY FIX: this used to only check ownership for req.user.role
    // === 'tenant' — every other role (property_manager, caretaker,
    // security, owner, super_admin) could pass ANY invoice_id in the
    // whole system and successfully fire an STK push against it, with a
    // client-controlled amount and phone number, regardless of which
    // organisation or property it actually belonged to. This single
    // query now scopes invoice_id the same way controllers/admin/invoices.js
    // does for every role, and derives tenancy_id from the invoice itself
    // rather than trusting whatever the client sent (which could
    // previously mismatch the actual invoice and mislabel the payment).
    let scopeSql = `SELECT i.id, i.balance, i.status, i.tenancy_id
      FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
      WHERE i.id=? AND i.org_id=? AND i.status IN ('unpaid','partial','overdue')`;
    const scopeParams = [invoice_id, req.user.org_id];

    if (req.user.role === 'tenant') {
      scopeSql += ` AND ten.tenant_id=(SELECT id FROM tenants WHERE user_id=?)`;
      scopeParams.push(req.user.sub);
    } else if (req.user.role === 'property_manager') {
      scopeSql += ' AND pr.manager_id=?'; scopeParams.push(req.user.sub);
    } else if (req.user.role === 'owner') {
      scopeSql += ' AND pr.owner_id=?'; scopeParams.push(req.user.sub);
    } else if (['caretaker','security'].includes(req.user.role) && req.user.property_id) {
      scopeSql += ' AND pr.id=?'; scopeParams.push(req.user.property_id);
    } else if (req.user.role !== 'super_admin') {
      return err(res, 'Invoice not found or already paid', 404);
    }

    const [[inv]] = await pool.query(scopeSql, scopeParams);
    if (!inv) return err(res, 'Invoice not found or already paid', 404);
    const tenancy_id = inv.tenancy_id;

    // SECURITY FIX: amount was previously taken from the client with no
    // validation at all — anyone with a valid invoice_id could initiate
    // a push for an amount unrelated to what's actually owed. A partial
    // payment (less than the balance) is legitimate; an amount above the
    // outstanding balance is not.
    const requestedAmount = parseFloat(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return err(res, 'Invalid amount');
    }
    if (requestedAmount > parseFloat(inv.balance) + 0.01) {
      return err(res, `Amount exceeds the outstanding balance of ${inv.balance}`);
    }
    amount = requestedAmount;

    // Check if M-Pesa is enabled (check both keys, fall back to env vars)
    const [settingRows] = await pool.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('mpesa_enabled','mpesa_stk_enabled')");
    const settingsMap = Object.fromEntries(settingRows.map(r => [r.setting_key, r.setting_value]));
    // Check if M-Pesa is enabled — any of the 3 keys being '1' means it's on
    const mpesaEnabled =
      settingsMap['mpesa_enabled']     === '1' ||
      settingsMap['mpesa_stk_enabled'] === '1' ||
      settingsMap['mpesa_stk_push']    === '1' ||
      (process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_KEY.length > 5 &&
       process.env.MPESA_SHORTCODE && process.env.MPESA_SHORTCODE.length > 3);

    if (!mpesaEnabled) {
      // Demo/simulation mode — still proceeds so tenant sees the flow
      const demoRef = `DEMO${Date.now().toString().slice(-8)}`;
      try {
        await pool.query(
          'INSERT INTO mpesa_transactions (checkout_request_id,invoice_id,tenancy_id,phone,amount,status,initiated_by) VALUES (?,?,?,?,?,?,?)',
          [demoRef, invoice_id, tenancy_id||null, phone, amount, 'pending', req.user.sub]);
      } catch (_) {}
      return ok(res, {
        checkout_request_id: demoRef,
        message: 'STK push sent (demo mode). Configure Daraja credentials in Settings to go live.',
        demo: true
      });
    }

    const token = await getDarajaToken();
    const { password, timestamp } = generatePassword();
    const shortcode = process.env.MPESA_SHORTCODE;
    const env = process.env.MPESA_ENV || 'sandbox';
    const stkUrl = env === 'production'
      ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
      : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

    const { data } = await axios.post(stkUrl, {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(parseFloat(amount)),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: `SNP-${tenancy_id}`,
      TransactionDesc: `SmartNyumba Rent Payment`,
    }, { headers: { Authorization: `Bearer ${token}` } });

    if (data.ResponseCode !== '0') return err(res, data.ResponseDescription || 'STK push failed');

    await pool.query(
      'INSERT INTO mpesa_transactions (checkout_request_id,merchant_request_id,invoice_id,tenancy_id,phone,amount,status,initiated_by) VALUES (?,?,?,?,?,?,?,?)',
      [data.CheckoutRequestID, data.MerchantRequestID, invoice_id, tenancy_id, phone, amount, 'pending', req.user.sub]);

    ok(res, {
      checkout_request_id: data.CheckoutRequestID,
      message: 'STK push sent! Check your phone and enter your M-Pesa PIN.',
    });
  } catch (e) {
    const msg = e.response?.data?.errorMessage || e.message;
    err(res, `M-Pesa error: ${msg}`, 500);
  }
};

// Check STK status
exports.checkStatus = async (req, res) => {
  try {
    const { checkout_id } = req.params;
    const [[txn]] = await pool.query(
      'SELECT status,transaction_code,result_desc,amount,completed_at,initiated_by,invoice_id FROM mpesa_transactions WHERE checkout_request_id=?',
      [checkout_id]);
    if (!txn) return err(res, 'Transaction not found', 404);
    // FIX: ownership used to be checked purely via `initiated_by`, but that
    // column is only ever set when the transaction was created through
    // THIS file's initiate(). Transactions created via services/mpesa.js's
    // stkPush (used by routes/mpesa.js's /stk and controllers/admin/
    // payments.js) never set it — so a tenant polling their own payment
    // made through that path would incorrectly get "Transaction not
    // found". Verify tenant ownership via the invoice chain instead,
    // which is reliable no matter which STK-push path created the row.
    if (req.user.role === 'tenant') {
      const [[owned]] = txn.invoice_id ? await pool.query(
        `SELECT 1 FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id
         JOIN tenants t ON ten.tenant_id=t.id WHERE i.id=? AND t.user_id=?`,
        [txn.invoice_id, req.user.sub]) : [[]];
      if (!owned && txn.initiated_by !== req.user.sub) return err(res, 'Transaction not found', 404);
    }
    // SECURITY FIX: for non-tenant roles this previously had no org check at
    // all — mpesa_transactions has no org_id column of its own, so a manager
    // from one org could view another org's transaction status/amount just
    // by knowing (or, for demo-mode's short timestamp-based IDs, guessing)
    // a checkout_request_id. Ownership is derived via the linked invoice.
    if (req.user.role !== 'tenant' && txn.invoice_id) {
      const [[ownerCheck]] = await pool.query('SELECT org_id FROM invoices WHERE id=?', [txn.invoice_id]);
      if (!ownerCheck || ownerCheck.org_id !== req.user.org_id) return err(res, 'Transaction not found', 404);
    }
    delete txn.initiated_by;
    delete txn.invoice_id;
    ok(res, { transaction: txn });
  } catch(e) { safeErr(res, e); }
};

// M-Pesa callback
exports.callback = async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  try {
    const stk = req.body.Body?.stkCallback;
    if (!stk) return;
    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;
    const [[txn]] = await pool.query('SELECT * FROM mpesa_transactions WHERE checkout_request_id=?', [CheckoutRequestID]);
    if (!txn) return;
    // Idempotency guard — Safaricom's own docs note a callback can be delivered more than
    // once (e.g. network retry). Without this, a duplicate delivery re-processes the same
    // payment: double-inserts a payment row, double-deducts the invoice balance, and
    // double-posts a ledger entry.
    if (txn.status !== 'pending') return;

    if (ResultCode === 0) {
      const meta = {};
      (CallbackMetadata?.Item||[]).forEach(i => { meta[i.Name] = i.Value; });
      const txnCode = meta.MpesaReceiptNumber;
      const payerName = meta.FirstName ? `${meta.FirstName} ${meta.MiddleName||''} ${meta.LastName||''}`.trim() : null;

      await pool.query(
        'UPDATE mpesa_transactions SET status=?,transaction_code=?,result_code=?,result_desc=?,mpesa_name=?,completed_at=NOW() WHERE checkout_request_id=?',
        ['completed', txnCode, ResultCode, ResultDesc, payerName, CheckoutRequestID]);

      // Auto-record payment
      if (txn.invoice_id && txn.tenancy_id) {
        const { receiptNumber } = require('../../utils/helpers');
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
          // BUG FIX: mpesa_transactions has no org_id column of its own,
          // and this INSERT INTO payments never set org_id at all — every
          // M-Pesa-completed payment was silently stamped org_id=1
          // (the column default) regardless of the invoice's real org.
          // Since controllers/admin/payments.js#getAll and the monthly
          // collection-totals cron job both filter payments directly by
          // payments.org_id (not derived via a join), a miscoded payment
          // here would vanish from that organisation's payment list and
          // financial reporting entirely. Derive it from the invoice,
          // which IS reliably org-scoped.
          const [[inv]] = await conn.query('SELECT balance, org_id FROM invoices WHERE id=?', [txn.invoice_id]);
          const [pr] = await conn.query(
            'INSERT INTO payments (invoice_id,tenancy_id,amount,payment_method,transaction_code,mpesa_phone,notes,org_id) VALUES (?,?,?,?,?,?,?,?)',
            [txn.invoice_id, txn.tenancy_id, txn.amount, 'mpesa', txnCode, txn.phone, `M-Pesa STK - ${payerName||''}`, inv?.org_id]);
          const rnum = await receiptNumber(pool);
          await conn.query('INSERT INTO receipts (payment_id,receipt_number) VALUES (?,?)', [pr.insertId, rnum]);
          const remaining = Math.max(0, parseFloat(inv.balance) - parseFloat(txn.amount));
          await conn.query('UPDATE invoices SET balance=?,status=? WHERE id=?',
            [remaining, remaining<=0?'paid':'partial', txn.invoice_id]);
          await conn.query('INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
            [txn.tenancy_id,'credit',txn.amount,`M-Pesa ${txnCode}`,'payment',pr.insertId]);
          await conn.commit(); conn.release();
        } catch (e2) { await conn.rollback(); conn.release(); }
      }
    } else {
      await pool.query('UPDATE mpesa_transactions SET status=?,result_code=?,result_desc=? WHERE checkout_request_id=?',
        [ResultCode===1032?'cancelled':'failed', ResultCode, ResultDesc, CheckoutRequestID]);
    }
  } catch (e) { global.logger?.error('STK callback error:', e.message); }
};