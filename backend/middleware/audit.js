'use strict';
/**
 * audit(action, resource) — structured audit event middleware
 * Writes to audit_events table (SaaS-scoped) in addition to legacy audit_log.
 * Usage: router.post('/path', auth(roles), audit('invoice.create', 'invoices'), handler)
 */
const pool = require('../config/db');

function audit(action, resource = null) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const resourceId = req.params?.id || body?.id || null;
        // SECURITY FIX: was reading raw x-forwarded-for directly (spoofable
        // without trust proxy set — see app.js). req.ip is now correct.
        const ip = (req.ip || '').slice(0,45);

        // Write to structured audit_events (new)
        pool.query(
          `INSERT INTO audit_events (org_id,actor_id,actor_role,actor_email,action,resource,resource_id,ip,user_agent,status_code)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [req.user.org_id||1, req.user.sub, req.user.role,
           req.user.email||null, action, resource,
           resourceId ? parseInt(resourceId)||null : null,
           ip, (req.headers['user-agent']||'').slice(0,500),
           res.statusCode]
        ).catch(()=>{});

        // Write to legacy audit_log (backwards compat)
        const details = JSON.stringify({ method: req.method, path: req.path,
          body: req.body ? JSON.stringify(req.body).slice(0,200) : null });
        pool.query(
          'INSERT INTO audit_log (user_id,user_name,action,entity_type,entity_id,details,ip_address) VALUES (?,?,?,?,?,?,?)',
          [req.user.sub, req.user.name||null, action, resource,
           resourceId ? parseInt(resourceId)||null : null, details, ip]
        ).catch(()=>{});
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = audit;
module.exports.auditMiddleware = audit;
