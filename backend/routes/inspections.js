const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/inspections');
router.get('/',  auth(['super_admin','property_manager','caretaker']), c.getAll);
router.post('/', auth(['super_admin','property_manager','caretaker']), c.create);
module.exports = router;
