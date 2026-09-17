'use strict';
const router = require('express').Router();
const auth   = require('../middleware/auth');
const sse    = require('../utils/sse');

/** GET /api/events — SSE stream, one persistent connection per client */
router.get('/', auth(), (req, res) => {
  sse.tag(res, req.user.org_id);
  sse.connect(req.user.sub, res);
  // Send immediate connection confirmation
  sse.push(req.user.sub, 'connected', { user_id: req.user.sub });
});

/** GET /api/events/stats — connection stats (super_admin only) */
router.get('/stats', auth(['super_admin']), (req, res) => {
  res.json(sse.stats());
});

module.exports = router;
