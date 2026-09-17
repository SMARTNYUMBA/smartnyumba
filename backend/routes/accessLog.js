const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/accessLog');
router.get('/',       auth(['super_admin','property_manager','security','caretaker']), c.getAll);
router.post('/',      auth(), c.create);
router.post('/webhook', c.webhook);
module.exports = router;
