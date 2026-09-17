const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/notifications');
router.get('/',           auth(), c.getAll);
router.put('/all/read',   auth(), c.markAllRead); // legacy
router.put('/read-all',   auth(), c.markAllRead); // frontend uses this
router.put('/:id/read',   auth(), c.markRead);
module.exports = router;
