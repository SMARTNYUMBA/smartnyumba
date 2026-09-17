'use strict';

const router = require('express').Router();
const multer = require('multer');
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/import');

// Memory storage — file parsed in controller, not saved to disk
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const SA = ['super_admin'];

router.get ('/template', auth(SA), c.template);
router.post('/validate', auth(SA), upload.single('file'), c.validate);
router.post('/commit',   auth(SA), c.commit);

module.exports = router;
