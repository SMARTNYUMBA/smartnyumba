'use strict';

const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/mpesaStk');

// ── M-Pesa callback IP allowlist middleware ───────────────────
// Shared with routes/mpesaStk.js so both callback endpoints get the
// same protection — see middleware/safaricomIp.js for why this matters.
const { safaricomOnly } = require('../middleware/safaricomIp');

// ── Initiate STK push ─────────────────────────────────────────
// CONSOLIDATION: this used to keep its own full copy of the ownership-
// check + STK-push logic, duplicating controllers/admin/payments.js
// #initiateStk almost exactly (both ultimately call services/mpesa.js
// #stkPush) — this was the third separate implementation of the same
// security-critical logic in the app. initiateStk is now the one
// canonical version (with the more precise role-based scoping this
// route used to have), so this just delegates to it. The response
// contract and URL are unchanged, so nothing calling this specific
// endpoint needs to change.
router.post('/stk', auth(['tenant', 'property_manager', 'owner', 'super_admin']), require('../controllers/admin/payments').initiateStk);

// ── Safaricom callback — IP-restricted in production ──────────
router.post('/callback', safaricomOnly, c.callback);

// ── Check STK transaction status ──────────────────────────────
// SECURITY FIX: this used to run its own query with no ownership check
// at all (any authenticated user, any org, could view any transaction's
// status/amount just by knowing a checkout_request_id). Delegating to
// mpesaStk.js's checkStatus, which already enforces that a tenant may
// only see their own transaction.
router.get('/status/:checkout_id', auth(), c.checkStatus);

module.exports = router;
