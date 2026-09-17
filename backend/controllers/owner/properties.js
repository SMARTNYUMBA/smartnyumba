const pool = require('../../config/db');
const { ok, safeErr } = require('../../utils/helpers');

exports.getProperties = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*,
        COUNT(DISTINCT u.id) AS total_units,
        COALESCE(SUM(u.status='occupied'),0) AS occupied_units,
        COALESCE(SUM(u.status='vacant'),0)   AS vacant_units,
        mu.full_name AS manager_name, mu.phone AS manager_phone, mu.email AS manager_email
      FROM properties p
      LEFT JOIN units u ON u.property_id = p.id
      LEFT JOIN users mu ON p.manager_id = mu.id
      WHERE p.owner_id = ?
      GROUP BY p.id ORDER BY p.name`, [req.user.sub]);
    ok(res, { properties: rows });
  } catch(e) { safeErr(res, e); }
};

exports.getUnits = async (req, res) => {
  try {
    const { property_id } = req.query;
    let sql = `
      SELECT u.*, p.name AS property_name,
        usr.full_name AS tenant_name, usr.phone AS tenant_phone,
        ten.rent_amount, ten.start_date, ten.end_date, ten.status AS tenancy_status,
        ten.id AS tenancy_id
      FROM units u
      JOIN properties p ON u.property_id = p.id
      LEFT JOIN tenancies ten ON ten.unit_id = u.id AND ten.status IN ('active','approved')
      LEFT JOIN tenants t ON ten.tenant_id = t.id
      LEFT JOIN users usr ON t.user_id = usr.id
      WHERE p.owner_id = ?`;
    const params = [req.user.sub];
    if (property_id) { sql += ' AND p.id = ?'; params.push(property_id); }
    sql += ' ORDER BY p.name, u.unit_number';
    const [rows] = await pool.query(sql, params);
    ok(res, { units: rows });
  } catch(e) { safeErr(res, e); }
};

exports.getMaintenance = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT mr.*, u.unit_number, p.name AS property_name,
        au.full_name AS assigned_name
      FROM maintenance_requests mr
      JOIN units u ON mr.unit_id = u.id
      JOIN properties p ON mr.property_id = p.id
      LEFT JOIN users au ON mr.assigned_to = au.id
      WHERE p.owner_id = ?
      ORDER BY FIELD(mr.priority,'emergency','urgent','normal','low'), mr.created_at DESC
      LIMIT 200`, [req.user.sub]);
    ok(res, { requests: rows });
  } catch(e) { safeErr(res, e); }
};

exports.getInvoices = async (req, res) => {
  try {
    const { property_id, status } = req.query;
    let sql = `
      SELECT i.*, ten.rent_amount, u.unit_number, p.name AS property_name,
        usr.full_name AS tenant_name
      FROM invoices i
      JOIN tenancies ten ON i.tenancy_id = ten.id
      JOIN units u ON ten.unit_id = u.id
      JOIN properties p ON u.property_id = p.id
      JOIN tenants t ON ten.tenant_id = t.id
      JOIN users usr ON t.user_id = usr.id
      WHERE p.owner_id = ?`;
    const params = [req.user.sub];
    if (property_id) { sql += ' AND p.id = ?';      params.push(property_id); }
    if (status)      { sql += ' AND i.status = ?';  params.push(status); }
    sql += ' ORDER BY i.created_at DESC LIMIT 500';
    const [rows] = await pool.query(sql, params);
    ok(res, { invoices: rows });
  } catch(e) { safeErr(res, e); }
};

exports.getExpenses = async (req, res) => {
  try {
    const { property_id } = req.query;
    let sql = `
      SELECT e.*, p.name AS property_name
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE p.owner_id = ?`;
    const params = [req.user.sub];
    if (property_id) { sql += ' AND p.id = ?'; params.push(property_id); }
    sql += ' ORDER BY e.expense_date DESC LIMIT 500';
    const [rows] = await pool.query(sql, params);
    ok(res, { expenses: rows });
  } catch(e) { safeErr(res, e); }
};

exports.getTenants = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        ten.id,
        u.full_name  AS tenant_name,
        u.phone      AS tenant_phone,
        u.email,
        ten.rent_amount,
        ten.start_date,
        ten.end_date,
        ten.status   AS tenancy_status,
        un.unit_number,
        pr.name      AS property_name,
        pr.id        AS property_id,
        COALESCE((
          SELECT SUM(i.balance)
          FROM invoices i
          WHERE i.tenancy_id = ten.id
            AND i.status IN ('unpaid','overdue','partial')
        ), 0) AS balance
      FROM tenancies ten
      JOIN tenants t  ON ten.tenant_id  = t.id
      JOIN users   u  ON t.user_id      = u.id
      JOIN units   un ON ten.unit_id    = un.id
      JOIN properties pr ON un.property_id = pr.id
      WHERE pr.owner_id = ? AND ten.status = 'active'
      ORDER BY pr.name, un.unit_number`, [req.user.sub]);
    ok(res, { tenants: rows });
  } catch(e) { safeErr(res, e); }
};

exports.getStaff = async (req, res) => {
  try {
    const [staff] = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.phone, u.role,
             u.property_id, u.is_active, u.last_login, u.profile_photo,
             p.name AS property_name
      FROM users u
      JOIN properties p ON u.property_id = p.id
      WHERE p.owner_id = ?
        AND u.role IN ('property_manager','caretaker','security')
      ORDER BY p.name, u.role, u.full_name`, [req.user.sub]);
    ok(res, { staff });
  } catch(e) { safeErr(res, e); }
};

exports.recordRemittance = async (req, res) => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const { property_id, amount, period, notes } = req.body;
    if (!property_id || !amount || !period)
      return res.status(400).json({ error: 'property_id, amount and period required' });

    // SECURITY FIX: property_id came from the request body unvalidated
    // against the caller's org — a manager could record a (fake)
    // remittance against another organisation's property, which would
    // then notify that org's real owner.
    const [[prop]] = await conn.query(
      'SELECT owner_id FROM properties WHERE id = ? AND org_id = ?', [property_id, req.user.org_id]);
    if (!prop) return res.status(404).json({ error: 'Property not found' });
    if (!prop.owner_id)
      return res.status(400).json({ error: 'Property has no owner assigned' });

    const [r] = await conn.query(
      'INSERT INTO owner_remittances (owner_id,property_id,amount,period,notes,recorded_by,org_id) VALUES (?,?,?,?,?,?,?)',
      [prop.owner_id, property_id, amount, period, notes || null, req.user.sub, req.user.org_id]);

    await conn.query(
      'INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
      [prop.owner_id, 'deposit_refund', 'Remittance recorded',
       `KES ${Number(amount).toLocaleString()} remittance for ${period} has been recorded.`,
       '/owner/remittances']);

    await conn.commit();
    ok(res, { id: r.insertId, message: 'Remittance recorded' }, 201);
  } catch(e) {
    await conn.rollback().catch(() => {});
    safeErr(res, e);
  } finally { conn.release(); }
};

exports.getRemittancesByManager = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'super_admin';
    // SECURITY FIX: super_admin had no org filter at all — saw remittance
    // records (financial data) across every organisation on the platform.
    let sql = `SELECT r.*, p.name AS property_name
               FROM owner_remittances r
               JOIN properties p ON r.property_id = p.id
               WHERE p.org_id = ?`;
    const params = [req.user.org_id];
    if (!isSuperAdmin) { sql += ' AND p.manager_id = ?'; params.push(req.user.sub); }
    sql += ' ORDER BY r.created_at DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    ok(res, { remittances: rows });
  } catch(e) { safeErr(res, e); }
};
