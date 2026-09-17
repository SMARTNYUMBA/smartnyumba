const router = require('express').Router();
const auth   = require('../middleware/auth');
const { docUpload } = require('../middleware/upload');
const c      = require('../controllers/admin/documents');
router.get('/',    auth(), c.getAll);
router.post('/',   auth(), docUpload.single('document'), c.upload);
router.delete('/:id', auth(['super_admin','property_manager']), c.delete);
module.exports = router;
