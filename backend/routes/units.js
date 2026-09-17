const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/units');
// Security can GET but not POST/PUT
router.get('/',    auth(['super_admin','property_manager','caretaker','security']), c.getAll);
router.post('/',   auth(['super_admin','property_manager']), c.create);
router.put('/:id', auth(['super_admin','property_manager','caretaker']), c.update);
module.exports = router;
