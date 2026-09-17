'use strict';
/**
 * Server-Sent Events (SSE) hub
 * Replaces 30-second polling for notifications, messages, and M-Pesa confirmations.
 *
 * Usage:
 *   const sse = require('./sse');
 *   sse.push(userId, 'payment_confirmed', { receipt_number, amount });
 */
const clients = new Map(); // userId(string) → Set<Response>

const sse = {
  /** Register a new SSE client connection */
  connect(userId, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
    res.flushHeaders?.();
    res.write(':ok\n\n'); // initial ping

    const uid = String(userId);
    if (!clients.has(uid)) clients.set(uid, new Set());
    clients.get(uid).add(res);

    // Heartbeat every 25s to keep connection alive through proxies
    const hb = setInterval(() => {
      try { res.write(':ping\n\n'); }
      catch { clearInterval(hb); sse.disconnect(uid, res); }
    }, 25000);

    res.on('close', () => { clearInterval(hb); sse.disconnect(uid, res); });
  },

  disconnect(userId, res) {
    const uid = String(userId);
    const set = clients.get(uid);
    if (set) { set.delete(res); if (set.size === 0) clients.delete(uid); }
  },

  /** Push an event to a specific user (all their open tabs) */
  push(userId, type, payload = {}) {
    const uid = String(userId);
    const data = JSON.stringify({ type, payload, ts: Date.now() });
    const set = clients.get(uid);
    if (!set || set.size === 0) return false;
    for (const res of set) {
      try { res.write(`data: ${data}\n\n`); }
      catch { sse.disconnect(uid, res); }
    }
    return true;
  },

  /** Push to all users in an org */
  pushOrg(orgId, type, payload = {}) {
    // org_id is stored in req.user, not in the clients map key
    // so we iterate all clients — acceptable for small-medium deployments
    for (const [uid, set] of clients) {
      for (const res of set) {
        try {
          if (res.__orgId === String(orgId)) {
            res.write(`data: ${JSON.stringify({ type, payload, ts: Date.now() })}\n\n`);
          }
        } catch { sse.disconnect(uid, res); }
      }
    }
  },

  /** Store orgId on the response object for pushOrg */
  tag(res, orgId) { res.__orgId = String(orgId); },

  stats() { return { connections: [...clients.values()].reduce((s,set)=>s+set.size,0), users: clients.size }; },
};

module.exports = sse;
