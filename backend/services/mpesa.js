// Smart Nyumba Pro — M-Pesa Daraja API Service
// Uses STK Push (Lipa na M-Pesa Online)
const axios = require('axios');
const pool  = require('../config/db');

const MPESA_URLS = {
  sandbox:    { auth: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', stk: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', query: 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query' },
  production: { auth: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',    stk: 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',        query: 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query' },
};

async function getToken() {
  const env  = process.env.MPESA_ENV || 'sandbox';
  const urls = MPESA_URLS[env];
  const creds = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const { data } = await axios.get(urls.auth, { headers: { Authorization: `Basic ${creds}` } });
  return { token: data.access_token, urls };
}

function generatePassword(shortcode, passkey) {
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const raw = `${shortcode}${passkey}${timestamp}`;
  return { password: Buffer.from(raw).toString('base64'), timestamp };
}

async function stkPush({ phone, amount, invoice_id, tenancy_id, account_ref, description }) {
  try {
    // Check DB settings first, then env var as fallback
    let mpesaEnabled = process.env.MPESA_ENABLED === '1';
    try {
      const [rows] = await pool.query(
        "SELECT setting_value FROM settings WHERE setting_key IN ('mpesa_enabled','mpesa_stk_enabled','mpesa_stk_push') AND setting_value='1' LIMIT 1"
      );
      if (rows.length > 0) mpesaEnabled = true;
    } catch (_) {}

    // Check if real Daraja credentials exist in environment
    const hasRealCreds = !!(
      process.env.MPESA_CONSUMER_KEY  && process.env.MPESA_CONSUMER_KEY.length  > 10 &&
      process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_CONSUMER_SECRET.length > 10 &&
      process.env.MPESA_SHORTCODE      && process.env.MPESA_SHORTCODE.length > 3 &&
      process.env.MPESA_PASSKEY        && process.env.MPESA_PASSKEY.length > 10
    );

    // Use demo mode if: M-Pesa not enabled in settings OR real credentials missing
    if (!mpesaEnabled || !hasRealCreds) {
      const demoRef = 'DEMO' + Date.now().toString().slice(-8);
      try {
        await pool.query(
          'INSERT INTO mpesa_transactions (checkout_request_id,invoice_id,tenancy_id,phone,amount,status) VALUES (?,?,?,?,?,?)',
          [demoRef, invoice_id, tenancy_id||null, phone, amount, 'pending']);
      } catch (_) {}
      const msg = !mpesaEnabled
        ? 'M-Pesa is disabled in Settings. Enable it under Settings → Features → M-Pesa payments.'
        : 'M-Pesa credentials not configured. Add MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE and MPESA_PASSKEY to your .env file.';
      return { success: true, checkout_request_id: demoRef, message: msg, demo: true };
    }

    const { token, urls } = await getToken();
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey   = process.env.MPESA_PASSKEY;
    const { password, timestamp } = generatePassword(shortcode, passkey);

    // Normalise phone: 07XX → 2547XX
    const cleanPhone = phone.replace(/^0/, '254').replace(/^\+/, '');

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: cleanPhone,
      PartyB: shortcode,
      PhoneNumber: cleanPhone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: account_ref || `SNP-${tenancy_id}`,
      TransactionDesc: description || 'Smart Nyumba Pro Payment',
    };

    const { data } = await axios.post(urls.stk, payload, { headers: { Authorization: `Bearer ${token}` } });

    // Save pending transaction
    await pool.query(
      'INSERT INTO mpesa_transactions (checkout_request_id,merchant_request_id,invoice_id,tenancy_id,phone,amount,status) VALUES (?,?,?,?,?,?,?)',
      [data.CheckoutRequestID, data.MerchantRequestID, invoice_id, tenancy_id, cleanPhone, amount, 'pending']
    );

    return { success: true, checkout_request_id: data.CheckoutRequestID, message: data.CustomerMessage };
  } catch (e) {
    console.error('M-Pesa STK Push error:', e.response?.data || e.message);
    return { success: false, error: e.response?.data?.errorMessage || e.message };
  }
}

async function handleCallback(body) {
  try {
    const stk = body.Body?.stkCallback;
    if (!stk) return;

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;

    const [[txn]] = await pool.query('SELECT * FROM mpesa_transactions WHERE checkout_request_id=?', [CheckoutRequestID]);
    if (!txn) return;

    if (ResultCode === 0) {
      // Extract metadata
      const meta = {};
      (CallbackMetadata?.Item || []).forEach(item => { meta[item.Name] = item.Value; });

      const txn_code = meta.MpesaReceiptNumber;
      const paid_at  = meta.TransactionDate;

      await pool.query(
        'UPDATE mpesa_transactions SET status=?,transaction_code=?,result_code=?,result_desc=?,completed_at=NOW(),raw_callback=? WHERE checkout_request_id=?',
        ['completed', txn_code, ResultCode, ResultDesc, JSON.stringify(body), CheckoutRequestID]
      );

      // Auto-record payment if linked to invoice
      if (txn.invoice_id && txn.tenancy_id) {
        const { receiptNumber } = require('../utils/helpers');
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
          const [[inv]] = await conn.query('SELECT * FROM invoices WHERE id=?', [txn.invoice_id]);
          // BUG FIX: this INSERT never set org_id — the same
          // silently-stamped-org_id=1 bug already found and fixed in
          // cron.js's applyLateFees/generateMonthlyInvoices/
          // processRecurringExpenses, except this one is in the REAL
          // M-Pesa production payment path (not the demo/simulated one
          // in controllers/admin/payments.js#checkStk, which already
          // correctly sets org_id from the invoice). Every real M-Pesa
          // payment for every org other than org 1 was being filed under
          // the wrong organisation's books.
          const [pr] = await conn.query(
            'INSERT INTO payments (invoice_id,tenancy_id,amount,payment_method,transaction_code,mpesa_phone,notes,org_id) VALUES (?,?,?,?,?,?,?,?)',
            [txn.invoice_id, txn.tenancy_id, txn.amount, 'mpesa', txn_code, txn.phone, 'M-Pesa STK Push', inv?.org_id || 1]
          );
          const rnum = await receiptNumber(pool);
          await conn.query('INSERT INTO receipts (payment_id,receipt_number) VALUES (?,?)', [pr.insertId, rnum]);

          const remaining = Math.max(0, parseFloat(inv.balance) - parseFloat(txn.amount));
          await conn.query('UPDATE invoices SET balance=?,status=? WHERE id=?', [remaining, remaining <= 0 ? 'paid' : 'partial', txn.invoice_id]);
          await conn.query('INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
            [txn.tenancy_id, 'credit', txn.amount, `M-Pesa ${txn_code}`, 'payment', pr.insertId]);
          await conn.commit();
          // FEATURE: fire payment.received for org webhook subscribers —
          // this is the real (non-demo) M-Pesa completion path.
          if (inv?.org_id) {
            require('./webhooks').deliverEvent('payment.received', {
              payment_id: pr.insertId, invoice_id: txn.invoice_id, tenancy_id: txn.tenancy_id,
              amount: Number(txn.amount), payment_method: 'mpesa', transaction_code: txn_code,
              receipt_number: rnum,
            }, inv.org_id);
          }
        } catch (e2) { await conn.rollback(); throw e2; }
        finally { conn.release(); }
      }
    } else {
      const status = ResultCode === 1032 ? 'cancelled' : 'failed';
      await pool.query('UPDATE mpesa_transactions SET status=?,result_code=?,result_desc=?,raw_callback=? WHERE checkout_request_id=?',
        [status, ResultCode, ResultDesc, JSON.stringify(body), CheckoutRequestID]);
    }
  } catch (e) {
    console.error('M-Pesa callback error:', e.message);
  }
}

module.exports = { stkPush, handleCallback };
