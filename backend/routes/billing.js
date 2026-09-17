'use strict';
const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/billing');
const SA     = ['super_admin'];

router.get ('/status',   auth(SA), c.status);
router.get ('/invoices', auth(SA), c.invoices);
router.get ('/plans',    c.plans);
router.post('/initiate', auth(SA), c.initiate);
router.post('/webhook',  c.webhook); // public — called by payment provider
module.exports = router;
