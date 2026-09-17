'use strict';

const crypto = require('crypto');

// ── Refresh-token cookie helpers ────────────────────────────────
// Centralized so every endpoint that issues or revokes a refresh
// token (login, mfa.verify, refresh, logout, logoutAll, org signup)
// uses identical cookie attributes — a mismatch between, say, login's
// cookie path and logout's clearCookie path would silently leave
// the cookie behind.
//
// Scoped to /api/auth so the browser only ever sends this cookie
// to auth endpoints, not on every request to the API.
const COOKIE_NAME = 'refresh_token';
const COOKIE_PATH = '/api/auth';
const MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days — matches refresh_tokens.expires_at

// The DB never stores the raw token — only its hash, the same pattern
// already used correctly for password-reset tokens. A leaked/dumped
// refresh_tokens table then hands an attacker nothing usable; they'd
// need the raw value, which only ever lives in the HttpOnly cookie.
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,                                   // JS (and therefore XSS) cannot read this
    secure:   process.env.NODE_ENV === 'production',   // HTTPS-only in prod; allow http on localhost dev
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path:     COOKIE_PATH,
    maxAge:   MAX_AGE_MS,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path:     COOKIE_PATH,
  });
}

module.exports = { COOKIE_NAME, setRefreshCookie, clearRefreshCookie, hashToken };
