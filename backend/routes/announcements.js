const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/announcements');
router.get('/',     auth(), c.getAll);
router.post('/',    auth(['super_admin','property_manager','tenant']), c.create);
router.delete('/:id', auth(['super_admin','property_manager']), c.remove);

module.exports = router;
