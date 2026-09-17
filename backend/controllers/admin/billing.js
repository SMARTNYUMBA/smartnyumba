'use strict';
const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

const PLANS = {
  starter:      { name:'Starter',      price: 2999,  max_units: 50,  max_users: 5,   max_properties: 3,  sms_included: 200  },
  professional: { name:'Professional', price: 9999,  max_units: 500, max_users: 25,  max_properties: 20, sms_included: 2000 },
  enterprise:   { name:'Enterprise',   price: 'custom', max_units: 99999, max_users: 9999, max_properties: 9999, sms_included: 99999 },
};

/** GET /api/billing/status */
exports.status = async (req, res) => {
  try {
    const [[org]] = await pool.query(
      'SELECT id,name,plan,plan_expires_at,is_active,billing_email FROM organisations WHERE id=?',
      [req.user.org_id]);
    if (!org) return err(res, 'Organisation not found', 404);

    const [[{ units }]]  = await pool.query('SELECT COUNT(*) AS units FROM units WHERE org_id=?',[req.user.org_id]);
    const [[{ users }]]  = await pool.query('SELECT COUNT(*) AS users FROM users WHERE org_id=?',[req.user.org_id]);
    const [[{ sms_count }]] = await pool.query(
      "SELECT COALESCE(SUM(count),0) AS sms_count FROM sms_usage WHERE org_id=? AND month_year=DATE_FORMAT(NOW(),'%Y-%m')",
      [req.user.org_id]);

    const planDetails = PLANS[org.plan] || PLANS.starter;
    const trialDays   = org.plan_expires_at
      ? Math.max(0, Math.ceil((new Date(org.plan_expires_at) - Date.now()) / 86400000))
      : 0;

    ok(res, {
      org, plan: planDetails,
      usage: { units, users, sms_this_month: parseInt(sms_count) },
      trial_days_remaining: trialDays,
      is_expired: org.plan_expires_at && new Date(org.plan_expires_at) < new Date(),
    });
  } catch(e) { safeErr(res, e); }
};

/** GET /api/billing/invoices */
exports.invoices = async (req, res) => {
  try {
    const [invoices] = await pool.query(
      'SELECT * FROM billing_invoices WHERE org_id=? ORDER BY created_at DESC LIMIT 24',
      [req.user.org_id]);
    ok(res, { invoices });
  } catch(e) { safeErr(res, e); }
};

/** GET /api/billing/plans */
exports.plans = async (req, res) => {
  ok(res, { plans: PLANS });
};

/** POST /api/billing/initiate — initiate subscription payment via Flutterwave/M-Pesa */
exports.initiate = async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan] || plan === 'enterprise')
      return err(res, 'Invalid plan. Contact sales for enterprise pricing.');
    const [[org]] = await pool.query('SELECT * FROM organisations WHERE id=?',[req.user.org_id]);
    const amount = PLANS[plan].price;
    const desc   = `SmartNyumba Pro — ${PLANS[plan].name} (monthly)`;

    const [bi] = await pool.query(
      'INSERT INTO billing_invoices (org_id,amount,description,billing_period,due_date) VALUES (?,?,?,DATE_FORMAT(NOW(),"%Y-%m"),DATE_ADD(NOW(),INTERVAL 7 DAY))',
      [req.user.org_id, amount, desc]);

    // Initiate Flutterwave payment
    // FIX: require() is synchronous and does not return a promise, so the
    // previous `.catch()` here threw a TypeError on every call and this
    // branch could never actually run — it silently fell through to the
    // M-Pesa manual-payment fallback below for every single plan upgrade.
    let fw = null;
    try { fw = require('../../services/flutterwave'); } catch (_) { fw = null; }
    if (fw) {
      const result = await fw.initiatePayment({
        amount, currency: 'KES', description: desc,
        customer: { email: org.billing_email||org.email, name: org.name },
        redirect_url: `${process.env.FRONTEND_URL}/billing?invoice=${bi.insertId}`,
        meta: { billing_invoice_id: bi.insertId, org_id: req.user.org_id, plan },
      });
      return ok(res, { payment_url: result.url, invoice_id: bi.insertId });
    }

    // Fallback: M-Pesa STK push
    ok(res, {
      invoice_id: bi.insertId,
      message: 'Send KES '+amount+' to paybill 400200, account: SNP-'+req.user.org_id,
      manual: true,
    });
  } catch(e) { safeErr(res, e); }
};

/**
 * POST /api/billing/webhook — payment confirmation from Flutterwave
 *
 * SECURITY FIX: the previous version trusted billing_invoice_id, plan,
 * status, and payment_ref straight from the request body — anyone who
 * knew (or guessed) an invoice ID could POST { status: 'successful' }
 * and get a free plan upgrade, no payment required.
 *
 * This version:
 *   1. Verifies Flutterwave's `verif-hash` header before touching anything.
 *   2. Never trusts amount/status from the webhook body — re-fetches the
 *      transaction from Flutterwave's API by ID and reads status/amount
 *      /currency from that authoritative response instead.
 *   3. Cross-checks the verified amount+currency against the invoice we
 *      actually created, not just "any invoice with this ID".
 *   4. Is idempotent — a duplicate webhook delivery for an already-paid
 *      invoice is a no-op instead of re-extending the plan expiry.
 *
 * Flutterwave's real webhook body shape is { event, data: { id, tx_ref,
 * status, amount, currency, meta: {...} } } — not the flat shape this
 * handler previously assumed, so this also fixes a payload-shape bug
 * that meant real Flutterwave webhooks likely never worked correctly.
 */
exports.webhook = async (req, res) => {
  try {
    const fw = require('../../services/flutterwave');

    if (!fw.verifyWebhookSignature(req)) {
      global.logger?.warn('Billing webhook rejected: invalid/missing verif-hash signature');
      return res.status(401).json({ received: false, error: 'Invalid signature' });
    }

    const data = req.body?.data;
    const transactionId = data?.id;
    if (!transactionId) return res.json({ received: true }); // nothing to verify, ignore

    // Re-fetch the transaction from Flutterwave directly — never trust the
    // webhook body's own amount/status fields, since those are exactly
    // what an attacker replaying/forging a webhook would control.
    let verified;
    try {
      verified = await fw.verifyTransaction(transactionId);
    } catch (e) {
      global.logger?.warn('Billing webhook: transaction verification failed: ' + e.message);
      return res.json({ received: true });
    }

    if (verified.status !== 'successful') return res.json({ received: true });

    const billing_invoice_id = verified.meta?.billing_invoice_id;
    const plan               = verified.meta?.plan;
    if (!billing_invoice_id) return res.json({ received: true });

    const [[bi]] = await pool.query('SELECT * FROM billing_invoices WHERE id=?', [billing_invoice_id]);
    if (!bi) return res.json({ received: true });

    // Idempotency guard — a webhook can be delivered more than once.
    if (bi.status === 'paid') return res.json({ received: true });

    // Confirm the verified payment actually matches what this invoice expects.
    const expectedAmount = parseFloat(bi.amount);
    const paidAmount     = parseFloat(verified.amount);
    if (paidAmount < expectedAmount || (verified.currency || 'KES') !== (bi.currency || 'KES')) {
      global.logger?.warn(
        `Billing webhook: amount/currency mismatch for invoice ${billing_invoice_id} ` +
        `(expected ${expectedAmount} ${bi.currency}, got ${paidAmount} ${verified.currency})`);
      return res.json({ received: true });
    }

    const payment_ref = verified.tx_ref || verified.flw_ref || String(transactionId);

    await pool.query("UPDATE billing_invoices SET status='paid',payment_ref=?,paid_at=NOW() WHERE id=?",
      [payment_ref, billing_invoice_id]);
    await pool.query(
      "UPDATE organisations SET plan=?,plan_expires_at=DATE_ADD(NOW(),INTERVAL 1 MONTH),is_active=1 WHERE id=?",
      [plan || bi.plan, bi.org_id]);
    global.logger?.info(`Billing: org ${bi.org_id} upgraded to ${plan || bi.plan}`);
    res.json({ received: true });
  } catch(e) { global.logger?.error(e); res.json({ received: true }); }
};
