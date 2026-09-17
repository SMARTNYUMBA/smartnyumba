const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/securityLogbook');
router.get('/',          auth(), c.getAll);
router.post('/',         auth(), c.create);
router.put('/:id/resolve', auth(['super_admin','property_manager','security']), c.resolve);
module.exports = router;
