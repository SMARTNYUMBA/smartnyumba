const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/sharedMeters');
const roles  = ['super_admin','property_manager','caretaker'];
router.get('/',        auth(roles), c.getAll);
router.post('/',       auth(['super_admin','property_manager']), c.create);
router.post('/reading',auth(roles), c.postReading);
module.exports = router;
