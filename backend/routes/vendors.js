const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/vendors');
const roles  = ['super_admin','property_manager'];
router.get('/',           auth(roles), c.getAll);
router.post('/',          auth(roles), c.create);
router.put('/:id',        auth(roles), c.update);
router.get('/:id/jobs',   auth(roles), c.getJobs);
module.exports = router;
