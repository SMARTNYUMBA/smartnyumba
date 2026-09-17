const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/parking');
router.get('/',           auth(), c.getAll);
router.post('/',          auth(['super_admin','property_manager']), c.create);
router.put('/:id/assign', auth(['super_admin','property_manager','security']), c.assign);
router.put('/:id/status', auth(['super_admin','property_manager','security']), c.updateStatus);
module.exports = router;
