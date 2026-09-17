'use strict';

/**
 * SmartNyumba Pro — Plan & Trial Enforcement Middleware
 *
 * Attach to any route that should be gated by subscription plan.
 *
 * Usage:
 *   const { planActive, withinLimit } = require('./middleware/plan');
 *
 *   // Block access if trial expired / plan suspended:
 *   router.use(auth(), planActive);
 *
 *   // Block if org is over their unit limit:
 *   router.post('/units', auth(), withinLimit('units'), c.create);
 */

const pool = require('../config/db');

const PLANS = {
  trial:        { max_units: 20,    max_users: 3,   max_properties: 2   },
  starter:      { max_units: 50,    max_users: 5,   max_properties: 3   },
  professional: { max_units: 500,   max_users: 25,  max_properties: 20  },
  enterprise:   { max_units: 99999, max_users: 9999, max_properties: 9999 },
};

// Cache org status for 60s to avoid a DB hit on every request
const _cache = new Map();
async function getOrgStatus(org_id) {
  const cached = _cache.get(org_id);
  if (cached && Date.now() - cached.ts < 60_000) return cached.data;

  const [[org]] = await pool.query(
    `SELECT id, plan, trial_ends_at, is_active, suspended_at, suspension_reason
     FROM organisations WHERE id = ?`, [org_id]
  );
  const data = org || null;
  _cache.set(org_id, { ts: Date.now(), data });
  return data;
}

/**
 * planActive — blocks request if:
 *   - org not found
 *   - org suspended by admin
 *   - trial has expired and no paid plan
 */
const planActive = async (req, res, next) => {
  // super_admin acting as a system-level user — skip plan checks
  if (!req.user?.org_id) return next();

  try {
    const org = await getOrgStatus(req.user.org_id);
    if (!org) return res.status(403).json({ error: 'Organisation not found', code: 'ORG_NOT_FOUND' });

    if (!org.is_active || org.suspended_at) {
      return res.status(403).json({
        error: 'Account suspended',
        reason: org.suspension_reason || 'Please contact support.',
        code: 'ORG_SUSPENDED',
      });
    }

    // Trial expiry check — only applies if plan is 'trial'
    if (org.plan === 'trial' && org.trial_ends_at) {
      const expired = new Date(org.trial_ends_at) < new Date();
      if (expired) {
        return res.status(402).json({
          error: 'Trial expired',
          message: 'Your 14-day free trial has ended. Please subscribe to continue.',
          upgrade_url: '/billing',
          code: 'TRIAL_EXPIRED',
        });
      }
      // Warn when < 3 days left (non-blocking — adds header, doesn't block)
      const daysLeft = Math.ceil((new Date(org.trial_ends_at) - Date.now()) / 86_400_000);
      if (daysLeft <= 3) res.setHeader('X-Trial-Days-Remaining', daysLeft);
    }

    next();
  } catch (e) {
    global.logger?.error('planActive middleware error:', e.message);
    next(); // fail-open so a Redis/DB blip doesn't lock everyone out
  }
};

/**
 * withinLimit(resource) — blocks create requests when plan limit reached.
 * resource: 'units' | 'users' | 'properties'
 */
const withinLimit = (resource) => async (req, res, next) => {
  if (!req.user?.org_id) return next();

  try {
    const org = await getOrgStatus(req.user.org_id);
    if (!org) return next();

    const limits = PLANS[org.plan] || PLANS.trial;
    const limit  = limits[`max_${resource}`];
    if (!limit) return next(); // unknown resource — don't block

    const tableMap = { units: 'units', users: 'users', properties: 'properties' };
    const table    = tableMap[resource];
    if (!table) return next();

    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) AS count FROM ${table} WHERE org_id = ?`, [req.user.org_id]
    );

    if (parseInt(count) >= limit) {
      return res.status(402).json({
        error: `Plan limit reached`,
        message: `Your ${org.plan} plan allows up to ${limit} ${resource}. Please upgrade to add more.`,
        current: parseInt(count),
        limit,
        upgrade_url: '/billing',
        code: 'PLAN_LIMIT_REACHED',
      });
    }

    next();
  } catch (e) {
    global.logger?.error(`withinLimit(${resource}) error:`, e.message);
    next(); // fail-open
  }
};

/** Invalidate cache for an org (call after plan upgrade) */
const invalidateOrg = (org_id) => _cache.delete(org_id);

module.exports = { planActive, withinLimit, invalidateOrg };
