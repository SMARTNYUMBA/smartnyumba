'use strict';
const router = require('express').Router();
const auth   = require('../middleware/auth');
const audit  = require('../middleware/audit');
const c      = require('../controllers/admin/apiKeys');
const SA     = ['super_admin'];

router.get ('/',    auth(SA), c.list);
router.post('/',    auth(SA), audit('apikey.create','api_keys'), c.create);
router.delete('/:id', auth(SA), audit('apikey.revoke','api_keys'), c.revoke);
module.exports = router;
