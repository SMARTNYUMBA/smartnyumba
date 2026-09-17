/**
 * Webhook delivery service — v2
 *
 * Changes from v1:
 *  - Exponential backoff retry queue (up to 5 attempts before disabling)
 *  - Delivery attempts logged to webhook_deliveries table
 *  - Auto-disable after 10 *consecutive* failures (vs. simple count in v1)
 *  - Per-event idempotency key prevents duplicate delivery on crash-restart
 */
'use strict';

const crypto  = require('crypto');
const pool    = require('../config/db');

const MAX_ATTEMPTS   = 5;
const BACKOFF_BASE_S = 60;   // 1 min → 2 min → 4 min → 8 min → 16 min
const DISABLE_AFTER  = 10;   // consecutive failures before auto-disable
const DELIVERY_TIMEOUT_MS = 10_000;

const SUPPORTED_EVENTS = [
  'payment.received', 'invoice.created', 'invoice.overdue',
  'tenancy.created', 'tenancy.terminated', 'maintenance.created',
  'maintenance.completed', 'vacate_notice.filed',
];

/** Sign a payload with HMAC-SHA256 using the subscriber's secret. */
function sign(payload, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// FIX: list/create/toggle/remove were referenced by routes/webhooks.js but
// never actually implemented here — every webhook management endpoint
// (list, create, toggle, delete) threw "webhooks.X is not a function".
// All four are org-scoped, since webhooks.org_id exists (via migration
// 006) but nothing previously used it — an org's admin could otherwise
// see/toggle/delete another organisation's registered webhooks.

/** List all webhooks for an org (secrets never returned). */
async function list(org_id) {
  const [rows] = await pool.query(
    'SELECT id,url,events,description,is_active,fail_count,disabled_reason,created_at FROM webhooks WHERE org_id=? ORDER BY created_at DESC',
    [org_id]
  );
  return rows;
}

/** Create a new webhook subscription for an org. Returns { id, secret }. */
async function create({ url, events, description, created_by, org_id }) {
  await require('../utils/urlSafety').assertPublicUrl(url); // SSRF guard — see utils/urlSafety.js
  const secret = crypto.randomBytes(24).toString('hex');
  const eventsStr = Array.isArray(events) ? events.join(',') : String(events || '');
  const [r] = await pool.query(
    'INSERT INTO webhooks (url,secret,events,description,created_by,org_id,is_active) VALUES (?,?,?,?,?,?,1)',
    [url, secret, eventsStr, description || null, created_by, org_id]
  );
  return { id: r.insertId, secret };
}

/** Enable/disable a webhook, scoped to its owning org. */
async function toggle(id, is_active, org_id) {
  const [r] = await pool.query(
    'UPDATE webhooks SET is_active=?, disabled_reason=NULL WHERE id=? AND org_id=?',
    [is_active ? 1 : 0, id, org_id]
  );
  if (r.affectedRows === 0) throw new Error('Webhook not found');
}

/** Delete a webhook, scoped to its owning org. */
async function remove(id, org_id) {
  const [r] = await pool.query('DELETE FROM webhooks WHERE id=? AND org_id=?', [id, org_id]);
  if (r.affectedRows === 0) throw new Error('Webhook not found');
}

/** One delivery attempt — returns { ok, status, error }. */
async function attemptDelivery(subscriber, event, payload) {
  // SSRF guard, re-checked at delivery time (not just registration time) to
  // close the DNS-rebinding window — see utils/urlSafety.js for why.
  try {
    await require('../utils/urlSafety').assertPublicUrl(subscriber.url);
  } catch (e) {
    return { ok: false, status: 0, error: `Delivery blocked: ${e.message}` };
  }

  const payloadStr  = JSON.stringify(payload);
  const signature   = sign(payloadStr, subscriber.secret);
  const controller  = new AbortController();
  const timer       = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const resp = await fetch(subscriber.url, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-SmartNyumba-Signature': signature,
        'X-SmartNyumba-Event':     event,
        'X-SmartNyumba-Delivery':  payload.delivery_id || '',
      },
      body:   payloadStr,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: e.message };
  }
}

/** Enqueue a delivery attempt into webhook_deliveries. */
async function enqueue(subscriberId, event, payload, attemptNumber = 1, deliverAt = null) {
  const deliver_at = deliverAt || new Date().toISOString().slice(0, 19).replace('T', ' ');
  await pool.query(
    `INSERT IGNORE INTO webhook_deliveries
     (subscriber_id, event, payload, attempt_number, deliver_at, status, delivery_id)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [subscriberId, event, JSON.stringify(payload), attemptNumber, deliver_at, payload.delivery_id]
  ).catch(() => {});
}

/**
 * Deliver an event to all active subscribers *in the given organisation*.
 * Fire-and-forget — does not block the caller.
 *
 * SECURITY FIX: this never took an org_id and queried ALL active webhooks
 * platform-wide matching the event type — deliverEvent() was never
 * actually called from anywhere yet (see controllers below), so this
 * hadn't leaked anything in practice, but the moment it got wired up to
 * real events, Org A's webhook subscriber would have received Org B's
 * payment/tenancy/maintenance data for every matching event on the whole
 * platform. Every call site below now passes its event's org_id.
 */
function deliverEvent(event, data, org_id) {
  if (!org_id) { global.logger?.error(`deliverEvent('${event}') called with no org_id — refusing to fire`); return; }
  setImmediate(async () => {
    let subscribers;
    try {
      [subscribers] = await pool.query(
        "SELECT * FROM webhooks WHERE is_active=1 AND org_id=? AND (events='*' OR FIND_IN_SET(?,events))",
        [org_id, event]
      );
    } catch { return; }

    const delivery_id = crypto.randomUUID();
    const payload = { event, data, delivery_id, timestamp: new Date().toISOString() };

    for (const sub of subscribers) {
      await enqueue(sub.id, event, payload, 1);
      setImmediate(() => processQueue(sub.id));
    }
  });
}

/**
 * Process pending deliveries for one subscriber — with exponential backoff.
 * Called after enqueueing and also by the retry cron every 2 minutes.
 */
async function processQueue(subscriberId) {
  let sub;
  try {
    [[sub]] = await pool.query('SELECT * FROM webhooks WHERE id=? AND is_active=1', [subscriberId]);
    if (!sub) return;

    const [pending] = await pool.query(
      `SELECT * FROM webhook_deliveries
       WHERE subscriber_id=? AND status='pending' AND deliver_at<=NOW()
       ORDER BY deliver_at LIMIT 10`,
      [subscriberId]
    );

    for (const delivery of pending) {
      // Mark as in-flight
      await pool.query("UPDATE webhook_deliveries SET status='sending' WHERE id=?", [delivery.id]);

      const payload = JSON.parse(delivery.payload);
      const result  = await attemptDelivery(sub, delivery.event, payload);

      if (result.ok) {
        await pool.query(
          "UPDATE webhook_deliveries SET status='delivered', delivered_at=NOW(), response_status=? WHERE id=?",
          [result.status, delivery.id]
        );
        // Reset consecutive fail count on success
        await pool.query("UPDATE webhooks SET fail_count=0 WHERE id=?", [sub.id]);
      } else {
        const nextAttempt = delivery.attempt_number + 1;
        const backoffSec  = BACKOFF_BASE_S * Math.pow(2, delivery.attempt_number - 1);

        if (nextAttempt <= MAX_ATTEMPTS) {
          // Schedule retry with backoff
          const retryAt = new Date(Date.now() + backoffSec * 1000)
            .toISOString().slice(0, 19).replace('T', ' ');
          await pool.query(
            "UPDATE webhook_deliveries SET status='pending', attempt_number=?, deliver_at=?, response_status=?, error=? WHERE id=?",
            [nextAttempt, retryAt, result.status, result.error || null, delivery.id]
          );
        } else {
          // Exhausted retries — mark failed
          await pool.query(
            "UPDATE webhook_deliveries SET status='failed', response_status=?, error=? WHERE id=?",
            [result.status, result.error || null, delivery.id]
          );
        }

        // Increment consecutive failure count
        await pool.query('UPDATE webhooks SET fail_count=fail_count+1 WHERE id=?', [sub.id]);

        // Auto-disable after DISABLE_AFTER consecutive failures
        const [[updated]] = await pool.query('SELECT fail_count FROM webhooks WHERE id=?', [sub.id]);
        if (updated.fail_count >= DISABLE_AFTER) {
          await pool.query(
            "UPDATE webhooks SET is_active=0, disabled_reason='Auto-disabled: 10 consecutive delivery failures' WHERE id=?",
            [sub.id]
          );
          global.logger?.warn(`Webhook ${sub.id} auto-disabled after ${DISABLE_AFTER} consecutive failures`);
        }
      }
    }
  } catch (e) {
    global.logger?.error(`Webhook processQueue error (sub ${subscriberId}): ${e.message}`);
  }
}

/**
 * Bootstrap: ensure webhook_deliveries table exists.
 * Called once at server startup.
 */
async function bootstrap() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      subscriber_id   INT NOT NULL,
      event           VARCHAR(100) NOT NULL,
      payload         JSON NOT NULL,
      delivery_id     VARCHAR(36),
      attempt_number  TINYINT UNSIGNED DEFAULT 1,
      status          ENUM('pending','sending','delivered','failed') DEFAULT 'pending',
      deliver_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      delivered_at    DATETIME,
      response_status SMALLINT,
      error           TEXT,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_delivery (delivery_id),
      INDEX idx_pending (subscriber_id, status, deliver_at),
      FOREIGN KEY (subscriber_id) REFERENCES webhooks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `).catch(() => {});

  // Add disabled_reason column if missing (migration guard)
  await pool.query(
    "ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS disabled_reason VARCHAR(255) NULL"
  ).catch(() => {});
}

/** Retry cron — call this every 2 minutes from cron.js. */
async function retryPending() {
  try {
    const [subs] = await pool.query(
      "SELECT DISTINCT subscriber_id FROM webhook_deliveries WHERE status='pending' AND deliver_at<=NOW() LIMIT 20"
    );
    await Promise.allSettled(subs.map(s => processQueue(s.subscriber_id)));
  } catch (e) {
    // Silently skip if the table doesn't exist yet (bootstrap hasn't run or failed).
    // ER_NO_SUCH_TABLE = errno 1146
    if (e.errno === 1146) return;
    global.logger?.error('Webhook retryPending error: ' + e.message);
  }
}

module.exports = { deliverEvent, processQueue, retryPending, bootstrap, sign, list, create, toggle, remove, SUPPORTED_EVENTS };
