const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/ratings');
router.post('/',      auth(['tenant']), c.submit);
router.get('/stats',  auth(['super_admin','property_manager']), c.getStats);
module.exports = router;
