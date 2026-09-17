const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/cases');
router.get('/',              auth(), c.getAll);
router.post('/',             auth(), c.create);
router.put('/:id',           auth(['super_admin','property_manager']), c.update);
router.get('/:id/comments',  auth(), c.getComments);
router.post('/:id/comments', auth(), c.addComment);
module.exports = router;
