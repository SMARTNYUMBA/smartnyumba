const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/tenants');
const roles  = ['super_admin','property_manager'];
router.get('/',    auth([...roles,'caretaker']), c.getAll);
router.post('/',   auth(roles), c.create);
router.get('/:id', auth(roles), c.getOne);
router.put('/:id', auth(roles), c.update);
module.exports = router;
