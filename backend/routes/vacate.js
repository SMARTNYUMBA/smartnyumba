const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/vacate');
router.get('/',    auth(['super_admin','property_manager','caretaker','tenant']), c.getAll);
router.post('/',   auth(['super_admin','property_manager','tenant']), c.create);
router.put('/:id', auth(['super_admin','property_manager']), c.update);
module.exports = router;
