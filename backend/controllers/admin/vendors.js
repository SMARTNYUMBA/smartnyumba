const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    const search = req.query.q ? `%${req.query.q}%` : null;
    // SECURITY FIX: no org filter previously — listed vendors across
    // every organisation on the platform.
    const [rows] = search
      ? await pool.query('SELECT id,name,category,phone,email,rating FROM vendors WHERE org_id=? AND (name LIKE ? OR category LIKE ?) ORDER BY name LIMIT 200', [req.user.org_id, search, search])
      : await pool.query('SELECT id,name,category,phone,email,rating FROM vendors WHERE org_id=? ORDER BY name LIMIT 200', [req.user.org_id]);
    ok(res, { vendors: rows });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { name, category, phone, email, address, notes } = req.body;
    if (!name) return err(res, 'Vendor name required');
    const [r] = await pool.query(
      'INSERT INTO vendors (name,category,phone,email,address,notes,org_id) VALUES (?,?,?,?,?,?,?)',
      [name, category||'other', phone||null, email||null, address||null, notes||null, req.user.org_id]);
    ok(res, { id: r.insertId, message: 'Vendor added' }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.update = async (req, res) => {
  try {
    const { name, category, phone, email, address, rating, notes, is_active } = req.body;
    // SECURITY FIX: previously no org check — anyone could edit another
    // organisation's vendor record.
    const [r] = await pool.query(
      'UPDATE vendors SET name=?,category=?,phone=?,email=?,address=?,rating=?,notes=?,is_active=? WHERE id=? AND org_id=?',
      [name, category||'other', phone||null, email||null, address||null, rating||null, notes||null, is_active??1, req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'Vendor not found', 404);
    ok(res, { message: 'Vendor updated' });
  } catch(e) { safeErr(res, e); }
};

exports.getJobs = async (req, res) => {
  try {
    // SECURITY FIX: no org check — could list job history for another
    // organisation's vendor by ID.
    const [rows] = await pool.query(`
      SELECT mr.*,un.unit_number,pr.name AS property_name
      FROM maintenance_requests mr JOIN units un ON mr.unit_id=un.id
      JOIN properties pr ON mr.property_id=pr.id
      WHERE mr.vendor_id=? AND mr.org_id=? ORDER BY mr.created_at DESC`, [req.params.id, req.user.org_id]);
    ok(res, { jobs: rows });
  } catch(e) { safeErr(res, e); }
};
