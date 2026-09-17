const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

// SECURITY FIX (whole file): every handler below ran with no org
// scoping at all. The route (routes/logbook.js) grants 'super_admin'
// and 'property_manager' access, not just 'security' — but the org
// filter here only ever applied to the 'security' role's own
// req.user.property_id. Any super_admin/property_manager calling a
// GET with no ?property_id (the default page load) got incidents/
// patrols/equipment across EVERY organisation on the platform, and an
// explicit ?property_id (GET) or property_id (POST) was never checked
// against the caller's org, so anyone could also read or write another
// organisation's records by guessing/supplying its property_id.
// security_log_incidents/patrols/equipment have no org_id column of
// their own (same as security_logbook), so scope via a JOIN through
// the parent property, exactly like admin/securityLogbook.js already does.

exports.getIncidents = async (req, res) => {
  try {
    let sql = `SELECT i.*,p.name AS property_name,u.full_name AS logged_by_name
      FROM security_log_incidents i JOIN properties p ON i.property_id=p.id
      JOIN users u ON i.logged_by=u.id WHERE p.org_id=?`;
    const params = [req.user.org_id];
    if (req.user.role === 'security' && req.user.property_id) {
      sql += ' AND i.property_id=?'; params.push(req.user.property_id);
    } else if (req.query.property_id) {
      sql += ' AND i.property_id=?'; params.push(req.query.property_id);
    }
    sql += ' ORDER BY i.created_at DESC LIMIT 50';
    const [rows] = await pool.query(sql, params);
    ok(res, { incidents: rows });
  } catch(e) { err(res, e.message, 500); }
};

exports.createIncident = async (req, res) => {
  try {
    const { property_id, incident_type, description, location, severity, occurred_at } = req.body;
    let pid = property_id || req.user.property_id;
    if (!pid) return err(res, 'property_id required');
    if (!description) return err(res, 'description required');

    // SECURITY FIX: pid was never checked against the caller's org —
    // could log (or, worse, escalate — see below) an incident against
    // another organisation's property.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [pid, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);

    const [r] = await pool.query(
      'INSERT INTO security_log_incidents (property_id,logged_by,incident_type,description,location,severity,occurred_at) VALUES (?,?,?,?,?,?,?)',
      [pid, req.user.sub, incident_type||null, description, location||null, severity||'minor', occurred_at||new Date()]);

    // Escalate critical incidents to property manager immediately
    if (severity === 'critical' || severity === 'major') {
      setImmediate(async () => {
        try {
          const [[prop]] = await pool.query('SELECT manager_id, name FROM properties WHERE id=?', [pid]);
          if (prop?.manager_id) {
            await pool.query(
              'INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
              [prop.manager_id, 'security', '🚨 ' + severity.toUpperCase() + ' incident at ' + prop.name,
               (incident_type||'Incident') + ': ' + description.slice(0,120), '/security/logbook']);
            // SMS the manager
            const [[mgr]] = await pool.query('SELECT phone FROM users WHERE id=?', [prop.manager_id]);
            if (mgr?.phone) {
              const sms = require('../../services/sms');
              await sms.send({ phone: mgr.phone, type: 'security',
                message: '🚨 SECURITY ALERT at ' + prop.name + ': ' + (incident_type||'Incident') +
                  ' — ' + description.slice(0,80) + '. Check the security logbook immediately.' });
            }
          }
        } catch (_) {}
      });
    }

    ok(res, { id: r.insertId, message: 'Incident logged' }, 201);
  } catch(e) { err(res, e.message, 500); }
};

exports.getPatrols = async (req, res) => {
  try {
    let sql = `SELECT p.*,pr.name AS property_name,u.full_name AS officer_name
      FROM security_log_patrols p JOIN properties pr ON p.property_id=pr.id
      JOIN users u ON p.officer_id=u.id WHERE pr.org_id=?`;
    const params = [req.user.org_id];
    if (req.user.role === 'security' && req.user.property_id) {
      sql += ' AND p.property_id=?'; params.push(req.user.property_id);
    } else if (req.query.property_id) {
      sql += ' AND p.property_id=?'; params.push(req.query.property_id);
    }
    sql += ' ORDER BY p.created_at DESC LIMIT 50';
    const [rows] = await pool.query(sql, params);
    ok(res, { patrols: rows });
  } catch(e) { err(res, e.message, 500); }
};

exports.createPatrol = async (req, res) => {
  try {
    const { property_id, route, notes, status, patrol_start, patrol_end } = req.body;
    let pid = property_id || req.user.property_id;
    if (!pid) return err(res, 'property_id required');

    // SECURITY FIX: pid was never checked against the caller's org.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [pid, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);

    const [r] = await pool.query(
      'INSERT INTO security_log_patrols (property_id,officer_id,route,notes,status,patrol_start,patrol_end) VALUES (?,?,?,?,?,?,?)',
      [pid, req.user.sub, route||null, notes||null, status||'completed', patrol_start||null, patrol_end||null]);
    ok(res, { id: r.insertId, message: 'Patrol logged' }, 201);
  } catch(e) { err(res, e.message, 500); }
};

exports.getEquipment = async (req, res) => {
  try {
    let sql = `SELECT e.*,p.name AS property_name,u.full_name AS checked_by_name
      FROM security_log_equipment e JOIN properties p ON e.property_id=p.id
      JOIN users u ON e.checked_by=u.id WHERE p.org_id=?`;
    const params = [req.user.org_id];
    if (req.user.role === 'security' && req.user.property_id) {
      sql += ' AND e.property_id=?'; params.push(req.user.property_id);
    } else if (req.query.property_id) {
      sql += ' AND e.property_id=?'; params.push(req.query.property_id);
    }
    sql += ' ORDER BY e.created_at DESC LIMIT 50';
    const [rows] = await pool.query(sql, params);
    ok(res, { equipment: rows });
  } catch(e) { err(res, e.message, 500); }
};

exports.createEquipmentCheck = async (req, res) => {
  try {
    const { property_id, equipment, status, notes } = req.body;
    let pid = property_id || req.user.property_id;
    if (!pid || !equipment) return err(res, 'property_id and equipment required');

    // SECURITY FIX: pid was never checked against the caller's org.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [pid, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);

    const [r] = await pool.query(
      'INSERT INTO security_log_equipment (property_id,checked_by,equipment,status,notes) VALUES (?,?,?,?,?)',
      [pid, req.user.sub, equipment, status||'ok', notes||null]);
    ok(res, { id: r.insertId, message: 'Equipment check logged' }, 201);
  } catch(e) { err(res, e.message, 500); }
};
