'use strict';

const router   = require('express').Router();
const auth     = require('../middleware/auth');
const webhooks = require('../services/webhooks');
const { ok, err } = require('../utils/helpers');

const ADMIN = ['super_admin'];

// GET /api/webhooks — list all webhooks
router.get('/', auth(ADMIN), async (req, res) => {
  try {
    const hooks = await webhooks.list(req.user.org_id);
    ok(res, { webhooks: hooks, supported_events: webhooks.SUPPORTED_EVENTS });
  } catch (e) { err(res, e.message, 500); }
});

// POST /api/webhooks — create webhook
router.post('/', auth(ADMIN), async (req, res) => {
  try {
    const { url, events, description } = req.body;
    if (!url)           return err(res, 'url required', 400);
    if (!events?.length) return err(res, 'events array required', 400);

    // Validate URL
    try { new URL(url); } catch { return err(res, 'Invalid URL', 400); }

    // Validate event names
    const invalid = events.filter(e => !webhooks.SUPPORTED_EVENTS.includes(e));
    if (invalid.length) return err(res, `Unknown events: ${invalid.join(', ')}. Supported: ${webhooks.SUPPORTED_EVENTS.join(', ')}`, 400);

    let result;
    try {
      result = await webhooks.create({ url, events, description, created_by: req.user.sub, org_id: req.user.org_id });
    } catch (e) {
      // SSRF guard failures (webhooks.create -> assertPublicUrl) surface
      // here as a 400, same as any other bad input, not a 500.
      return err(res, e.message, 400);
    }
    ok(res, {
      id:      result.id,
      secret:  result.secret,
      message: 'Webhook created. Save the secret — it will not be shown again.',
      note:    'Sign verification: X-SmartNyumba-Signature: sha256=HMAC(secret, body)',
    }, 201);
  } catch (e) { err(res, e.message, 500); }
});

// PUT /api/webhooks/:id/toggle — enable/disable
router.put('/:id/toggle', auth(ADMIN), async (req, res) => {
  try {
    const { is_active } = req.body;
    await webhooks.toggle(req.params.id, !!is_active, req.user.org_id);
    ok(res, { message: is_active ? 'Webhook enabled' : 'Webhook disabled' });
  } catch (e) {
    if (e.message === 'Webhook not found') return err(res, e.message, 404);
    err(res, e.message, 500);
  }
});

// POST /api/webhooks/:id/test — fire a test event
router.post('/:id/test', auth(ADMIN), async (req, res) => {
  try {
    const pool = require('../config/db');
    // SECURITY FIX: no org check — any org's admin could fire a test
    // ping at (and thereby probe the URL and existence of) another
    // organisation's registered webhook.
    const [[hook]] = await pool.query('SELECT * FROM webhooks WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    if (!hook) return err(res, 'Webhook not found', 404);

    // SSRF guard — the webhook may have been registered before this check
    // existed, or its DNS could have changed since registration, so this
    // is re-checked here too, not just at creation time.
    try {
      await require('../utils/urlSafety').assertPublicUrl(hook.url);
    } catch (e) {
      return err(res, e.message, 400);
    }

    const payload = JSON.stringify({
      event:     'test',
      timestamp:  new Date().toISOString(),
      data:       { message: 'SmartNyumba webhook test ping', webhook_id: hook.id },
    });
    const sig = webhooks.sign(payload, hook.secret);

    let status, responseTime;
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 10000);
      const start      = Date.now();
      const resp       = await fetch(hook.url, {
        method:  'POST',
        headers: {
          'Content-Type':              'application/json',
          'X-SmartNyumba-Event':       'test',
          'X-SmartNyumba-Signature':    sig,
          'User-Agent':                'SmartNyumba-Webhooks/1.0',
        },
        body:    payload,
        signal:  controller.signal,
      });
      clearTimeout(timeout);
      status       = resp.status;
      responseTime = Date.now() - start;
    } catch (fetchErr) {
      return ok(res, { success: false, error: fetchErr.message });
    }

    ok(res, { success: status >= 200 && status < 300, status, response_time_ms: responseTime });
  } catch (e) { err(res, e.message, 500); }
});

// DELETE /api/webhooks/:id
router.delete('/:id', auth(ADMIN), async (req, res) => {
  try {
    await webhooks.remove(req.params.id, req.user.org_id);
    ok(res, { message: 'Webhook deleted' });
  } catch (e) {
    if (e.message === 'Webhook not found') return err(res, e.message, 404);
    err(res, e.message, 500);
  }
});

module.exports = router;
