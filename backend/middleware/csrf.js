'use strict';

/**
 * Lightweight CSRF protection — custom request header check.
 *
 * Any state-mutating request from the browser MUST include
 * X-Requested-With: XMLHttpRequest. A rogue page cannot set
 * custom headers on a cross-origin simple request (form submit,
 * img tag), so the header's presence proves the request came
 * from our own fetch/XHR — not a forged cross-site submission.
 *
 * The frontend axios instance already sets X-Request-ID; we
 * also add X-Requested-With there (see api.js interceptor).
 *
 * Safe methods (GET, HEAD, OPTIONS) are never mutating — exempt.
 * Server-to-server callbacks (M-Pesa, webhooks) use the skip fn.
 */

const SAFE_METHODS    = new Set(['GET', 'HEAD', 'OPTIONS']);
const REQUIRED_HEADER = 'x-requested-with';

/**
 * @param {{ skip?: (req: import('express').Request) => boolean }} [opts]
 */
const csrf = (opts = {}) => (req, res, next) => {
  if (SAFE_METHODS.has(req.method))       return next();
  if (opts.skip && opts.skip(req))        return next();
  // Allow server-to-server (no Origin header) in dev only
  if (!req.headers.origin && process.env.NODE_ENV !== 'production') return next();
  if (req.headers[REQUIRED_HEADER])       return next();

  return res.status(403).json({
    error: 'CSRF check failed: X-Requested-With header missing',
  });
};

module.exports = csrf;
