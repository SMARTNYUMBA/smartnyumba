const pool = require('../../config/db');
const { ok, err, safeErr } = require("../../utils/helpers");

exports.getAll = async (req, res) => {
  try {
    // SECURITY FIX: no org check at all for super_admin/property_manager/
    // caretaker without an explicit ?property_id — every organisation's
    // access log (actor names, vehicle plates, camera/gate events) was
    // visible to anyone with one of those roles on the platform.
    let sql = `SELECT al.*,p.name AS property_name FROM access_log al
      JOIN properties p ON al.property_id=p.id WHERE p.org_id=?`;
    const params = [req.user.org_id];
    // Security only sees their assigned property
    if (req.user.role === 'security' && req.user.property_id) {
      sql += ' AND al.property_id=?'; params.push(req.user.property_id);
    } else if (req.query.property_id) {
      sql += ' AND al.property_id=?'; params.push(req.query.property_id);
    }
    if (req.query.event_type) { sql += ' AND al.event_type=?'; params.push(req.query.event_type); }
    if (req.query.date)       { sql += ' AND DATE(al.created_at)=?'; params.push(req.query.date); }
    sql += ' ORDER BY al.created_at DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    ok(res, { logs: rows });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    let { property_id, unit_id, event_type, actor_name, vehicle_plate, camera_id, gate_id, source, notes } = req.body;
    // auto-fill property for security from their JWT token
    if (!property_id && req.user.property_id) property_id = req.user.property_id;
    if (!property_id) return err(res, 'property_id required');
    if (!event_type)  return err(res, 'event_type required');
    // SECURITY FIX: this route is open to any authenticated user
    // (auth() with no role restriction, including tenants), and
    // property_id was never validated against the caller's org — anyone
    // could inject fabricated access-log entries against any property.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);
    const plate = vehicle_plate ? vehicle_plate.toUpperCase().trim() : null;
    const [r] = await pool.query(
      'INSERT INTO access_log (property_id,unit_id,event_type,actor_name,actor_id,vehicle_plate,camera_id,gate_id,source,notes,org_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [property_id, unit_id||null, event_type, actor_name||null, req.user.sub, plate, camera_id||null, gate_id||null, source||'manual', notes||null, req.user.org_id]);
    ok(res, { id: r.insertId, message: 'Access event logged' }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.webhook = async (req, res) => {
  try {
    const secret = req.headers['x-cctv-secret'];
    if (secret !== process.env.CCTV_WEBHOOK_SECRET) return res.status(401).json({ error: 'Unauthorized' });
    const { property_id, event_type, actor_name, vehicle_plate, camera_id } = req.body;
    const plate = vehicle_plate ? vehicle_plate.toUpperCase().trim() : null;
    await pool.query('INSERT INTO access_log (property_id,event_type,actor_name,vehicle_plate,camera_id,source) VALUES (?,?,?,?,?,?)',
      [property_id, event_type||'camera_motion', actor_name||null, plate, camera_id||null, 'cctv']);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
