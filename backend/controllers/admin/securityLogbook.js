const pool = require('../../config/db');
const { ok, err, safeErr } = require("../../utils/helpers");

exports.getAll = async (req, res) => {
  try {
    let sql = `SELECT sl.*,u.full_name AS reported_by_name,p.name AS property_name
      FROM security_logbook sl JOIN users u ON sl.reported_by=u.id
      JOIN properties p ON sl.property_id=p.id WHERE p.org_id=?`;
    const params = [req.user.org_id]; // SECURITY FIX: no org filter previously —
    // security_logbook has no org_id column of its own, scoped via properties.
    if (req.query.property_id) { sql += ' AND sl.property_id=?'; params.push(req.query.property_id); }
    if (req.query.log_type)    { sql += ' AND sl.log_type=?';    params.push(req.query.log_type); }
    if (req.query.severity)    { sql += ' AND sl.severity=?';    params.push(req.query.severity); }
    if (req.user.role === 'security' && req.user.property_id) {
      sql += ' AND sl.property_id=?'; params.push(req.user.property_id);
    }
    sql += ' ORDER BY sl.created_at DESC LIMIT 100';
    const [rows] = await pool.query(sql, params);
    ok(res, { logs: rows });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { property_id, log_type, title, description, severity, location } = req.body;
    let pid = property_id;
    if (!pid && req.user.property_id) pid = req.user.property_id;
    if (!pid) return err(res, 'property_id required');
    if (!log_type || !title) return err(res, 'log_type and title required');

    // SECURITY FIX: property_id (when explicitly supplied) was never
    // checked against the caller's org.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [pid, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);

    const [r] = await pool.query(
      'INSERT INTO security_logbook (property_id,log_type,title,description,severity,location,reported_by) VALUES (?,?,?,?,?,?,?)',
      [pid, log_type, title, description||null, severity||'low', location||null, req.user.sub]);

    // Alert management on high severity
    if (severity === 'high' || severity === 'critical') {
      // SECURITY FIX: same bug pattern as maintenance.js/cases.js —
      // previously alerted every super_admin/property_manager across
      // every organisation on the platform.
      const [managers] = await pool.query("SELECT id FROM users WHERE role IN('super_admin','property_manager') AND is_active=1 AND org_id=?", [req.user.org_id]);
      for (const m of managers) {
        await pool.query('INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
          [m.id, 'security', `${severity.toUpperCase()} security event`, title, '/security/logbook']);
      }
    }
    ok(res, { id: r.insertId, message: 'Log entry created' }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.resolve = async (req, res) => {
  try {
    // SECURITY FIX: previously ran unconditionally with no ownership
    // check — security_logbook has no org_id column, scoped via a JOIN
    // through its property.
    const [r] = await pool.query(
      `UPDATE security_logbook sl
       JOIN properties p ON sl.property_id = p.id
       SET sl.resolved=1, sl.resolved_at=NOW(), sl.resolved_by=?
       WHERE sl.id=? AND p.org_id=?`,
      [req.user.sub, req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'Log entry not found', 404);
    ok(res, { message: 'Marked as resolved' });
  } catch(e) { safeErr(res, e); }
};
