'use strict';
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

const PLAN_LIMITS = {
  starter:      { max_units: 50,  max_users: 5,   max_properties: 3  },
  professional: { max_units: 500, max_users: 25,  max_properties: 20 },
  enterprise:   { max_units: Infinity, max_users: Infinity, max_properties: Infinity },
};

/**
 * auth(roles?) — JWT + API-key authentication
 * Adds req.user = { sub, name, email, role, org_id, property_id, is_api_key? }
 */
const auth = (roles = []) => async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Authentication required' });

  // ── API key path ──────────────────────────────────────────
  if (token.startsWith('snp_')) {
    try {
      const pool = require('../config/db');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const [[key]] = await pool.query(
        'SELECT * FROM api_keys WHERE key_hash=? AND is_active=1', [hash]);
      if (!key) return res.status(401).json({ error: 'Invalid API key' });
      if (key.expires_at && new Date(key.expires_at) < new Date())
        return res.status(401).json({ error: 'API key expired' });
      // Non-blocking last_used update
      pool.query('UPDATE api_keys SET last_used=NOW() WHERE id=?', [key.id]).catch(()=>{});
      req.user = { sub: 'api:'+key.id, name: key.name, role: key.role,
                   org_id: key.org_id, is_api_key: true };
      if (roles.length && !roles.includes(key.role))
        return res.status(403).json({ error: 'Insufficient permissions' });
      return next();
    } catch(e) { return res.status(500).json({ error: 'Server error' }); }
  }

  // ── JWT path ──────────────────────────────────────────────
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    global.logger?.error('JWT_SECRET missing or too short');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (decoded.type === 'mfa_pending')
      return res.status(401).json({ error: 'MFA verification required', requires_mfa: true });
    req.user = decoded;

    // ── Live suspension check + property_id refresh (cached 5s) ──────────
    // BUG FIX: this used to skip suspension checks entirely for `tenant`,
    // alongside skipping the (staff-only) property_id refresh for both
    // `tenant` and `super_admin`. Those are two different concerns that
    // got bundled into one condition — bundling them meant a tenant
    // suspended by an admin kept full access for the rest of their
    // token's life (up to 1h access token, or indefinitely if they kept
    // hitting /refresh, since that endpoint didn't check suspension
    // either — see controllers/auth/index.js#refresh). Staff roles were
    // never affected by that gap, since they already got this live check.
    // Now: suspension is checked live for every role except super_admin
    // (top of the hierarchy, not suspendable through this path); the
    // property_id refresh — which only makes sense for staff, since a
    // tenant's property comes from their tenancy, not users.property_id —
    // stays staff-only.
    if (decoded.role && decoded.role !== 'super_admin' && decoded.sub) {
      try {
        const pool = require('../config/db');
        const cache = require('../services/cache');
        const cacheKey = `user_status:${decoded.sub}`;
        let fresh = await cache.get(cacheKey);
        if (!fresh) {
          const [[row]] = await pool.query('SELECT property_id, is_suspended, is_active, suspension_reason FROM users WHERE id=? LIMIT 1', [decoded.sub]);
          if (row) {
            fresh = row;
            await cache.set(cacheKey, fresh, 5); // 5s TTL, matches original intent
          }
        }
        if (fresh) {
          if (decoded.role !== 'tenant') req.user.property_id = fresh.property_id;
          if (fresh.is_suspended) {
            return res.status(403).json({ error: 'Account suspended', reason: fresh.suspension_reason || 'Contact your administrator' });
          }
          if (fresh.is_active === 0) {
            return res.status(403).json({ error: 'Account deactivated' });
          }
        }
      } catch (_) {} // non-fatal — fall through with JWT data if DB unavailable
    }

    if (roles.length && !roles.includes(decoded.role)) {
      global.logger?.warn(`Forbidden: ${decoded.sub} (${decoded.role}) → ${req.method} ${req.url}`);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  } catch(e) {
    if (e.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * planLimit(resource) — enforce plan limits before create operations
 * Returns 402 with upgrade_url when limit is reached.
 */
auth.planLimit = (resource) => async (req, res, next) => {
  try {
    const pool = require('../config/db');
    const orgId = req.user?.org_id;
    if (!orgId) return next();
    const [[org]] = await pool.query(
      'SELECT plan, max_units, max_users, max_properties FROM organisations WHERE id=?', [orgId]);
    if (!org) return next();

    const planMax = PLAN_LIMITS[org.plan]?.[`max_${resource}`] ?? Infinity;
    const hardMax = org[`max_${resource}`] ?? Infinity;
    const limit   = Math.min(planMax, hardMax);
    if (limit === Infinity) return next();

    const tableMap = { units: 'units', users: 'users', properties: 'properties' };
    const table = tableMap[resource];
    if (!table) return next();

    const [[{ n }]] = await pool.query(
      `SELECT COUNT(*) AS n FROM ${table} WHERE org_id=?`, [orgId]);
    if (n >= limit) {
      return res.status(402).json({
        error: `${org.plan} plan limit reached (${limit} ${resource})`,
        current: n, limit,
        upgrade_url: '/billing',
      });
    }
    next();
  } catch(e) { next(); } // non-fatal — don't block on limit check failure
};

module.exports = auth;
