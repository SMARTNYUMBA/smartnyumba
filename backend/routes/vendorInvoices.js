const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/vendorInvoices');
const MGRS   = ['super_admin','property_manager'];

router.get('/',           auth(MGRS), c.getAll);
router.post('/',          auth(MGRS), c.create);
router.put('/:id/approve', auth(MGRS), c.approve);
router.put('/:id/paid',    auth(MGRS), c.markPaid);
module.exports = router;
