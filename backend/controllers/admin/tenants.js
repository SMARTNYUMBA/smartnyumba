const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool   = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    const q = req.query.q || '';
    let sql = `SELECT u.id,u.full_name,u.email,u.phone,u.is_active,u.created_at,
      t.id AS tenant_id,t.id_number,t.vehicle_plate,
      ten.id AS tenancy_id,ten.status AS tenancy_status,ten.rent_amount,
      un.unit_number,pr.name AS property_name,
      COALESCE(SUM(CASE WHEN i.status IN('unpaid','overdue','partial') THEN i.balance ELSE 0 END),0) AS balance
      FROM users u JOIN tenants t ON u.id=t.user_id
      LEFT JOIN tenancies ten ON t.id=ten.tenant_id AND ten.status='active'
      LEFT JOIN units un ON ten.unit_id=un.id
      LEFT JOIN properties pr ON un.property_id=pr.id
      LEFT JOIN invoices i ON ten.id=i.tenancy_id AND i.status IN('unpaid','overdue','partial')
      WHERE u.role='tenant' AND u.org_id=?`;
    const params = [req.user.org_id]; // SECURITY FIX: previously no org filter —
    // a super_admin saw every tenant across every organisation on the platform.
    if (q) { sql += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    // Property manager: only show tenants in their properties
    if (req.user.role === 'property_manager') {
      sql += ' AND pr.manager_id=?'; params.push(req.user.sub);
    }
    // Caretaker: only show tenants in their property
    if (req.user.role === 'caretaker' && req.user.property_id) {
      sql += ' AND pr.id=?'; params.push(req.user.property_id);
    }
    sql += ' GROUP BY u.id ORDER BY u.full_name';
    const [rows] = await pool.query(sql, params);
    ok(res, { tenants: rows });
  } catch(e) { safeErr(res, e); }
};

exports.getOne = async (req, res) => {
  try {
    // SECURITY FIX: previously WHERE u.id=? with no org check — a user
    // could pull another organisation's tenant's full PII record
    // (ID number, tenancies, invoice history) just by ID.
    const [[u]] = await pool.query(`SELECT u.*,t.id AS tenant_id,t.id_number,t.vehicle_plate,t.emergency_contact,t.emergency_phone FROM users u JOIN tenants t ON u.id=t.user_id WHERE u.id=? AND u.org_id=?`, [req.params.id, req.user.org_id]);
    if (!u) return err(res, 'Tenant not found', 404);
    const [tenancies] = await pool.query('SELECT ten.*,un.unit_number,pr.name AS property_name FROM tenancies ten JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id WHERE ten.tenant_id=? ORDER BY ten.created_at DESC', [u.tenant_id]);
    const [invoices]  = await pool.query('SELECT i.* FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id WHERE ten.tenant_id=? ORDER BY i.created_at DESC LIMIT 20', [u.tenant_id]);
    ok(res, { tenant: u, tenancies, invoices });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { full_name,email,phone,password,id_number,vehicle_plate,emergency_contact,emergency_phone } = req.body;
    if (!full_name||!email) return err(res, 'full_name and email required');
    const [[exists]] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (exists) return err(res, 'Email already exists', 409);

    // SECURITY FIX: Math.random() is not cryptographically secure — this
    // comment already said "secure one" but the implementation wasn't.
    const finalPassword = password || crypto.randomBytes(9).toString('base64url') + '!A1';
    const hash = await bcrypt.hash(finalPassword, 12);

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      // SECURITY/DATA-INTEGRITY FIX: org_id was never set on either
      // insert — every tenant created by every organisation was silently
      // landing in org_id=1.
      const [ur] = await conn.query('INSERT INTO users (full_name,email,phone,password_hash,role,org_id) VALUES (?,?,?,?,?,?)', [full_name, email, phone||null, hash, 'tenant', req.user.org_id]);
      await conn.query('INSERT INTO tenants (user_id,id_number,vehicle_plate,emergency_contact,emergency_phone,org_id) VALUES (?,?,?,?,?,?)', [ur.insertId, id_number||null, vehicle_plate||null, emergency_contact||null, emergency_phone||null, req.user.org_id]);
      await conn.commit(); conn.release();

      // Try to send welcome email with credentials (non-fatal if email fails)
      try {
        const emailSvc = require('../../services/email');
        if (emailSvc && emailSvc.send) {
          await emailSvc.send({
            to: email,
            subject: 'Welcome to Smart Nyumba — Your Account Details',
            html: `<p>Hello ${full_name},</p>
                   <p>Your tenant account has been created.</p>
                   <p><strong>Email:</strong> ${email}<br/>
                   <strong>Password:</strong> ${!password ? finalPassword : '(as set by admin)'}</p>
                   <p>Please log in and change your password immediately.</p>`,
          });
        }
      } catch (_) { /* email failure is non-fatal */ }

      ok(res, { id: ur.insertId, message: 'Tenant created', auto_password: !password ? finalPassword : undefined }, 201);
    } catch (e2) { await conn.rollback(); conn.release(); throw e2; }
  } catch(e) { safeErr(res, e); }
};

exports.update = async (req, res) => {
  try {
    const { full_name,phone,id_number,passport_number,vehicle_plate,emergency_contact,emergency_phone,is_active } = req.body;
    // SECURITY FIX: previously WHERE id=? with no org check — any
    // authenticated user could edit another organisation's tenant record.
    const [r] = await pool.query('UPDATE users SET full_name=?,phone=?,is_active=? WHERE id=? AND org_id=? AND role=?',
      [full_name, phone||null, is_active??1, req.params.id, req.user.org_id, 'tenant']);
    if (r.affectedRows === 0) return err(res, 'Tenant not found', 404);
    const [[t]] = await pool.query('SELECT id FROM tenants WHERE user_id=?', [req.params.id]);
    if (t) await pool.query('UPDATE tenants SET id_number=?,passport_number=?,vehicle_plate=?,emergency_contact=?,emergency_phone=? WHERE id=?',
      [id_number||null, passport_number||null, vehicle_plate||null, emergency_contact||null, emergency_phone||null, t.id]);
    ok(res, { message: 'Tenant updated' });
  } catch(e) { safeErr(res, e); }
};
