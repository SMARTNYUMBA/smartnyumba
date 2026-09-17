'use strict';

/**
 * M-Pesa callback IP allowlist middleware.
 *
 * Safaricom's documented Daraja callback IP ranges. Any POST to an
 * M-Pesa callback endpoint from outside this list is rejected in
 * production. In dev/sandbox (NODE_ENV !== 'production') all requests
 * are allowed through, since sandbox callbacks and local testing don't
 * originate from these IPs.
 *
 * SECURITY NOTE: this exists because the M-Pesa callback endpoints are
 * intentionally unauthenticated (Safaricom can't send a Bearer token).
 * Without this guard, anyone who knows a pending transaction's
 * checkout_request_id (which is returned to the client that initiated
 * it) could POST a forged "payment successful" callback and have an
 * invoice marked paid without ever paying. This middleware must be
 * applied to EVERY route that reaches the M-Pesa callback controller —
 * see routes/mpesa.js and routes/mpesaStk.js.
 */
const SAFARICOM_IPS = [
  '196.201.214.200', '196.201.214.206', '196.201.213.114',
  '196.201.214.207', '196.201.214.208', '196.201.213.44',
  '196.201.212.127', '196.201.212.128', '196.201.212.129',
  '196.201.212.136', '196.201.212.74',  '196.201.212.69',
];

function safaricomOnly(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next(); // allow all in dev/sandbox
  // SECURITY FIX: this used to read req.headers['x-forwarded-for']
  // directly, which — combined with app.js never setting trust proxy —
  // meant the value was whatever the client sent, fully spoofable.
  // Anyone could set X-Forwarded-For to one of the IPs below and forge
  // an M-Pesa "payment successful" callback. req.ip is now correct
  // (Express resolves it from X-Forwarded-For itself, honoring the
  // trusted-hop count set via app.set('trust proxy', ...) in app.js,
  // and discards anything beyond that trusted hop).
  const ip = req.ip || '';
  if (SAFARICOM_IPS.includes(ip)) return next();
  global.logger?.warn(`M-Pesa callback rejected from unknown IP: ${ip}`);
  return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
}

module.exports = { safaricomOnly, SAFARICOM_IPS };
