'use strict';
const router = require('express').Router();
const auth   = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { logoUpload, verifyMime, photoMimes } = require('../middleware/upload');
const c      = require('../controllers/admin/organisations');
const SA     = ['super_admin'];

router.get  ('/me',    auth(SA), c.getMyOrg);
router.patch('/me',    auth(SA), c.update);
router.post ('/me/logo', auth(SA), logoUpload.single('logo'), verifyMime(photoMimes), c.uploadLogo);
router.get  ('/audit', auth(SA), c.auditLog);
router.get  ('/sessions',     auth(SA), c.activeSessions);
router.delete('/sessions/:id', auth(SA), auditMiddleware('session.revoke', 'refresh_tokens'), c.revokeSession);
module.exports = router;
