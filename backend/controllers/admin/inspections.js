const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    // SECURITY FIX: no org check at all — any property_manager or
    // caretaker could list unit inspection records across every
    // organisation on the platform.
    let sql = `SELECT i.*,u.unit_number,p.name AS property_name,usr.full_name AS inspector_name
      FROM unit_inspections i JOIN units u ON i.unit_id=u.id
      JOIN properties p ON i.property_id=p.id JOIN users usr ON i.inspected_by=usr.id
      WHERE i.org_id=?`;
    const params = [req.user.org_id];
    if (req.query.unit_id)     { sql += ' AND i.unit_id=?';     params.push(req.query.unit_id); }
    if (req.query.property_id) { sql += ' AND i.property_id=?'; params.push(req.query.property_id); }
    if (req.user.role === 'property_manager') { sql += ' AND p.manager_id=?'; params.push(req.user.sub); }
    else if (req.user.role === 'caretaker' && req.user.property_id) { sql += ' AND i.property_id=?'; params.push(req.user.property_id); }
    sql += ' ORDER BY i.inspection_date DESC LIMIT 50';
    const [rows] = await pool.query(sql, params);
    ok(res, { inspections: rows });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { unit_id, inspection_date, condition_rating, notes, checklist } = req.body;
    if (!unit_id || !inspection_date) return err(res, 'unit_id and inspection_date required');
    // SECURITY FIX: no org check — a caretaker/manager could log an
    // inspection against another organisation's unit by guessing its ID.
    const [[unit]] = await pool.query('SELECT property_id FROM units WHERE id=? AND org_id=?', [unit_id, req.user.org_id]);
    if (!unit) return err(res, 'Unit not found', 404);
    const [r] = await pool.query(
      'INSERT INTO unit_inspections (unit_id,property_id,inspected_by,inspection_date,condition_rating,notes,checklist,org_id) VALUES (?,?,?,?,?,?,?,?)',
      [unit_id, unit.property_id, req.user.sub, inspection_date, condition_rating||'good', notes||null,
       checklist ? JSON.stringify(checklist) : null, req.user.org_id]);
    ok(res, { id: r.insertId, message: 'Inspection logged' }, 201);
  } catch(e) { safeErr(res, e); }
};
