'use strict';
const router = require('express').Router();
const auth   = require('../middleware/auth');
const pool   = require('../config/db');
const { ok, err, safeErr } = require('../utils/helpers');

/** GET /api/jobs/:id — poll job status */
router.get('/:id', auth(), async (req, res) => {
  try {
    const [[job]] = await pool.query(
      'SELECT id,type,status,progress,result,error,created_at,done_at FROM jobs WHERE id=? AND org_id=?',
      [req.params.id, req.user.org_id]);
    if (!job) return err(res, 'Job not found', 404);
    ok(res, { job });
  } catch(e) { safeErr(res, e); }
});

module.exports = router;
