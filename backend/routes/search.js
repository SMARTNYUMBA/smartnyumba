const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/search');
router.get('/', auth(), c.search);
module.exports = router;
