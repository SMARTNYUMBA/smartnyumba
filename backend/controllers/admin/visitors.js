const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    const date   = req.query.date   || new Date().toISOString().split('T')[0];
    const period = req.query.period; // 'today' | 'week' | 'month' | 'on_site'

    let dateFilter = 'DATE(v.check_in)=?';
    let dateParam  = date;

    if (period === 'week') {
      dateFilter = 'v.check_in >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
      dateParam  = null;
    } else if (period === 'month') {
      dateFilter = 'v.check_in >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
      dateParam  = null;
    } else if (period === 'on_site') {
      // Show ALL visitors still on-site (checked in, never checked out) regardless of date
      dateFilter = "v.status='checked_in'";
      dateParam  = null;
    }

    let sql = `SELECT v.*,un.unit_number,pr.name AS property_name,cb.full_name AS checked_in_by_name
      FROM visitors v JOIN properties pr ON v.property_id=pr.id
      LEFT JOIN units un ON v.unit_id=un.id LEFT JOIN users cb ON v.checked_in_by=cb.id
      WHERE ${dateFilter} AND v.org_id=?`;
    const params = dateParam ? [dateParam, req.user.org_id] : [req.user.org_id];
    // SECURITY FIX: no org filter previously — a super_admin with no
    // property_id in their JWT saw every visitor across every organisation.
    // Tenant sees only their own visitors
    if (req.user.role === 'tenant') {
      sql += ' AND v.host_user_id=?';
      params.push(req.user.sub);
    }
    // Security sees only their assigned property
    // Scope: managers see only their properties, security/caretaker only theirs
    if (req.user.role === 'property_manager') {
      sql += ' AND pr.manager_id=?'; params.push(req.user.sub);
    } else if (req.user.property_id) {
      sql += ' AND v.property_id=?'; params.push(req.user.property_id);
    }
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    sql += ` ORDER BY v.check_in DESC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await pool.query(sql, params);
    // Count on-site visitors separately (not affected by pagination)
    const [[{ on_site }]] = await pool.query(
      "SELECT COUNT(*) AS on_site FROM visitors v WHERE v.status='checked_in' AND v.org_id=?" +
      (req.user.property_id ? ' AND v.property_id=?' : ''),
      req.user.property_id ? [req.user.org_id, req.user.property_id] : [req.user.org_id]
    ).catch(() => [[{ on_site: 0 }]]);
    ok(res, { visitors: rows, on_site: parseInt(on_site), date, pagination: { page, limit } });
  } catch(e) { safeErr(res, e); }
};

exports.checkIn = async (req, res) => {
  try {
    let { property_id, unit_id, tenancy_id, name, phone, id_number, vehicle_plate, purpose, host_name } = req.body;
    if (!property_id || !name) return err(res, 'property_id and visitor name required');

    // Uppercase number plate
    if (vehicle_plate) vehicle_plate = vehicle_plate.toUpperCase().trim();

    // Tenant: force their own property and unit
    if (req.user.role === 'tenant') {
      const [[t]] = await pool.query(`
        SELECT ten.id tenancy_id,un.id unit_id,un.property_id FROM tenants t
        JOIN tenancies ten ON t.id=ten.tenant_id AND ten.status='active'
        JOIN units un ON ten.unit_id=un.id WHERE t.user_id=?`, [req.user.sub]);
      if (t) { property_id = t.property_id; unit_id = t.unit_id; tenancy_id = t.tenancy_id; }
    } else {
      // SECURITY FIX: property_id supplied by a non-tenant user was
      // never checked against their org — could log a visitor against
      // another organisation's property.
      const [[p]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
      if (!p) return err(res, 'Property not found', 404);
    }

    const [r] = await pool.query(
      'INSERT INTO visitors (property_id,unit_id,tenancy_id,name,phone,id_number,vehicle_plate,purpose,host_name,host_user_id,checked_in_by,check_in,status,org_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),?,?)',
      [property_id, unit_id||null, tenancy_id||null, name, phone||null, id_number||null, vehicle_plate||null, purpose||null, host_name||null, req.user.sub, req.user.sub, 'checked_in', req.user.org_id]);
    ok(res, { id: r.insertId, message: `${name} checked in` }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.checkOut = async (req, res) => {
  try {
    // SECURITY FIX: previously no org check — could check out (edit the
    // status of) another organisation's visitor record by ID.
    const [[v]] = await pool.query('SELECT * FROM visitors WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    if (!v) return err(res, 'Visitor not found', 404);

    // Tenant can only check out their own visitors
    if (req.user.role === 'tenant' && v.host_user_id !== req.user.sub)
      return err(res, 'You can only check out your own visitors', 403);

    await pool.query("UPDATE visitors SET check_out=NOW(),checked_out_by=?,status='checked_out' WHERE id=? AND org_id=?",
      [req.user.sub, req.params.id, req.user.org_id]);
    ok(res, { message: 'Visitor checked out' });
  } catch(e) { safeErr(res, e); }
};
