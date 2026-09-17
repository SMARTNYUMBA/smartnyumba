'use strict';

const router = require('express').Router();
const auth   = require('../middleware/auth');
const { paymentSchema } = require('../middleware/validators');
const { auditMiddleware } = require('../middleware/audit');
const c = require('../controllers/admin/payments');

router.get('/',                   auth(),  c.getAll);
router.post('/',                  auth(),  paymentSchema, auditMiddleware('RECORD_PAYMENT', 'payments'), c.record);
// SECURITY FIX: this allowed any authenticated role — caretaker/security
// could reach it too, and (before the scoping fix in initiateStk above)
// would have fallen through to only an org-wide check with no property
// scoping. Restricted to the roles that actually have a legitimate
// reason to trigger a payment: paying tenant, and the people responsible
// for that tenancy's property.
router.post('/stk/initiate',      auth(['tenant','property_manager','owner','super_admin']),  c.initiateStk);
router.get('/stk/:checkout_id',   auth(),  c.checkStk);

module.exports = router;