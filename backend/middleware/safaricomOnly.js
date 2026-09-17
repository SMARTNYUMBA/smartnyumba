'use strict';

// ── M-Pesa callback IP allowlist middleware ───────────────────
// Safaricom's documented IP ranges for callbacks.
// Extracted to a shared module so every /callback route (STK push,
// C2B, etc.) uses the identical check — a route that forgets to
// apply this is a route anyone can POST fake payment confirmations to.
const SAFARICOM_IPS = [
  '196.201.214.200', '196.201.214.206', '196.201.213.114',
  '196.201.214.207', '196.201.214.208', '196.201.213.44',
  '196.201.212.127', '196.201.212.128', '196.201.212.129',
  '196.201.212.136', '196.201.212.74',  '196.201.212.69',
];

function safaricomOnly(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next(); // allow all in dev/sandbox
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  if (SAFARICOM_IPS.includes(ip)) return next();
  global.logger?.warn(`M-Pesa callback rejected from unknown IP: ${ip}`);
  return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
}

module.exports = safaricomOnly;
