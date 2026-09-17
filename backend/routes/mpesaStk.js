const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/mpesaStk');

// SECURITY FIX: this route pointed at the same callback handler as
// routes/mpesa.js's /callback but, unlike that one, had no IP
// allowlist — meaning anyone who knew a transaction's
// checkout_request_id could forge a "payment successful" callback here
// and have an invoice marked paid without paying. Now protected the
// same way. See middleware/safaricomIp.js for details.
const { safaricomOnly } = require('../middleware/safaricomIp');

// CONSOLIDATION: this pointed at mpesaStk.js's own initiate(), a third
// copy of the same ownership-check + STK-push logic as
// controllers/admin/payments.js#initiateStk and routes/mpesa.js's old
// /stk handler. Delegating here too, same as routes/mpesa.js — see the
// comment there for the full reasoning. mpesaStk.js#initiate is left
// defined but no longer wired to a route, in case anything outside this
// repo requires the module directly rather than calling the HTTP route.
router.post('/initiate',          auth(['tenant','property_manager','owner','super_admin']), require('../controllers/admin/payments').initiateStk);
router.get('/status/:checkout_id',auth(), c.checkStatus);
router.post('/callback',          safaricomOnly, c.callback);
module.exports = router;
