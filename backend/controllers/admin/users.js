
// ── GET single user with full details ─────────────────────────
exports.getOne = async (req, res) => {
  try {
    // SECURITY FIX: previously WHERE u.id=? with no org check — any
    // authenticated user could pull another organisation's user record,
    // including ID numbers and emergency contacts.
    const [[user]] = await pool.query(
      `SELECT u.*,
        COALESCE(p.name, (
          SELECT pr.name
          FROM tenancies ten
          JOIN units un       ON un.id = ten.unit_id
          JOIN properties pr  ON pr.id = un.property_id
          WHERE ten.tenant_id = t.id AND ten.status = 'active'
          ORDER BY ten.id DESC LIMIT 1
        )) AS property_name,
        COALESCE(t.id_number, u.id_number) AS id_number,
        COALESCE(t.passport_number, u.passport_number) AS passport_number,
        COALESCE(t.emergency_contact, u.emergency_contact) AS emergency_contact,
        COALESCE(t.emergency_phone, u.emergency_phone) AS emergency_phone,
        COALESCE(t.vehicle_plate, u.vehicle_plate) AS vehicle_plate,
        t.id AS tenant_id
       FROM users u
       LEFT JOIN properties p ON u.property_id=p.id
       LEFT JOIN tenants t ON t.user_id=u.id
       WHERE u.id=? AND u.org_id=?`, [req.params.id, req.user.org_id]);
    if (!user) return err(res, 'User not found', 404);

    // Remove password hash from response
    delete user.password_hash;

    // If tenant, also get tenancy info
    let tenancy = null;
    if (user.tenant_id) {
      const [[ten]] = await pool.query(
        `SELECT ten.*, un.unit_number, pr.name AS property_name
         FROM tenancies ten
         JOIN units un ON ten.unit_id=un.id
         JOIN properties pr ON un.property_id=pr.id
         WHERE ten.tenant_id=? AND ten.status='active' LIMIT 1`,
        [user.tenant_id]).catch(() => [[]]);
      if (ten) tenancy = ten;
    }

    ok(res, { user: { ...user, tenancy } });
  } catch(e) { safeErr(res, e); }
};

// backend/controllers/admin/users.js
const bcrypt = require('bcryptjs');
const pool   = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

/**
 * Ensure suspension columns exist — fixes deployments where the migration
 * adding is_suspended was never run. Safe to call multiple times.
 */
async function ensureColumns() {
  try {
    // Fast check: try selecting the column. If it exists this completes instantly.
    // If errno 1054 (ER_BAD_FIELD_ERROR) the column is missing — add it.
    // information_schema.COLUMNS was slow (600-800ms on every boot).
    await pool.query('SELECT is_suspended FROM users LIMIT 0');
    return; // column exists, nothing to do
  } catch (e) {
    if (e.errno !== 1054) return; // unexpected error — skip silently
  }
  // First boot or missed migration — add all suspension columns
  for (const sql of [
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended TINYINT(1) NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at DATETIME NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by INT UNSIGNED NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT NULL',
  ]) {
    await pool.query(sql).catch(() => {});
  }
}
ensureColumns().catch(() => {});

exports.getAll = async (req, res) => {
  try {
    // Select is_suspended directly — avoids the separate query + silent-catch anti-pattern.
    // If the column is missing, ensureColumns() (called at startup) will have added it.
    // Tenants never get users.property_id set directly — their property comes
    // from tenants -> tenancies (active) -> units -> properties instead. The
    // property_name lookup below fell back to nothing for every tenant row
    // as a result, so it's now COALESCEd with that chain via a correlated
    // subquery (kept as a subquery rather than a JOIN so a tenant can never
    // multiply into more than one output row even if they somehow had more
    // than one active tenancy).
    let sql = `
      SELECT u.id, u.full_name, u.email, u.phone, u.role, u.property_id,
        u.is_active, u.last_login, u.created_at, u.profile_photo,
        u.id_number, u.passport_number, u.emergency_contact, u.emergency_phone, u.vehicle_plate,
        COALESCE(u.is_suspended, 0) AS is_suspended,
        u.suspension_reason, u.suspended_at,
        COALESCE(p.name, (
          SELECT pr.name
          FROM tenancies ten
          JOIN units un       ON un.id = ten.unit_id
          JOIN properties pr  ON pr.id = un.property_id
          WHERE ten.tenant_id = t.id AND ten.status = 'active'
          ORDER BY ten.id DESC LIMIT 1
        )) AS property_name
      FROM users u
      LEFT JOIN properties p ON u.property_id=p.id
      LEFT JOIN tenants t    ON t.user_id=u.id
      WHERE u.org_id=?`;
    const params = [req.user.org_id]; // SECURITY FIX: no org filter previously —
    // listed every user across every organisation on the platform.
    if (req.query.role) { sql += ' AND u.role=?'; params.push(req.query.role); }
    // SECURITY FIX: a property_manager could call this (routes/users.js
    // allows super_admin AND property_manager) and get every user in the
    // whole organisation — every other manager, every caretaker/security
    // on properties they don't manage, full emails/phones/ID numbers —
    // not just their own team. pages/manager/Staff.jsx relies on this
    // endpoint and only filters the *displayed* rows client-side by role,
    // so the over-broad org-wide list was already fully downloaded to
    // the browser before that filter ever ran. Scope managers to staff
    // on their own properties, plus themselves.
    if (req.user.role === 'property_manager') {
      sql += ' AND (u.id=? OR u.property_id IN (SELECT id FROM properties WHERE manager_id=?))';
      params.push(req.user.sub, req.user.sub);
    }
    sql += ' ORDER BY u.role, u.full_name';

    const [rows] = await pool.query(sql, params);

    let countSql = 'SELECT role, COUNT(*) AS count FROM users WHERE org_id=?';
    const countParams = [req.user.org_id];
    if (req.user.role === 'property_manager') {
      countSql += ' AND (id=? OR property_id IN (SELECT id FROM properties WHERE manager_id=?))';
      countParams.push(req.user.sub, req.user.sub);
    }
    countSql += ' GROUP BY role';
    const [counts] = await pool.query(countSql, countParams);
    ok(res, {
      users: rows,
      counts: Object.fromEntries(counts.map(c => [c.role, parseInt(c.count)]))
    });
  } catch(e) { err(res, e.message, 500); }
};

exports.create = async (req, res) => {
  try {
    const { full_name, email, phone, role, password, property_id, id_number, passport_number } = req.body;
    if (!full_name || !email || !role || !password) return err(res, 'Name, email, role and password required');
    const [[ex]] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (ex) return err(res, 'Email already in use', 409);
    const hash = await bcrypt.hash(password, 12);
    // DATA-INTEGRITY FIX: org_id was never set here — every user created
    // by every organisation was silently landing in org_id=1.
    const [r] = await pool.query(
      'INSERT INTO users (full_name,email,phone,password_hash,role,property_id,org_id) VALUES (?,?,?,?,?,?,?)',
      [full_name, email, phone||null, hash, role, property_id||null, req.user.org_id]);
    if (role === 'tenant') {
      await pool.query('INSERT INTO tenants (user_id,id_number,passport_number,org_id) VALUES (?,?,?,?)',
        [r.insertId, id_number||null, passport_number||null, req.user.org_id]);
    }
    ok(res, { id: r.insertId, message: 'User created' }, 201);
  } catch(e) { err(res, e.message, 500); }
};

exports.update = async (req, res) => {
  try {
    const {
      full_name, phone, role, is_active, property_id,
      emergency_contact, emergency_phone, id_number, vehicle_plate,
    } = req.body;

    // Update base fields
    // SECURITY FIX: previously WHERE id=? with no org check — any
    // authenticated user could edit another organisation's user,
    // including changing their role or reassigning their property.
    // BUG FIX: neither the admin nor manager "Edit user" form sends `role`
    // or `is_active` in the payload — those aren't fields either form
    // exposes. Setting them unconditionally here meant every single save
    // (including just assigning a property) silently blanked the user's
    // role to NULL (no NOT NULL constraint to catch it) and force-reset
    // is_active to 1, even for a suspended or not-yet-activated account.
    // COALESCE so an omitted field keeps its current DB value instead of
    // being wiped, while a field this endpoint's caller does explicitly
    // send (including an intentional null/blank) still takes effect.
    const [r] = await pool.query(
      `UPDATE users SET
         full_name=?,
         phone=?,
         role=COALESCE(?, role),
         is_active=COALESCE(?, is_active),
         property_id=?
       WHERE id=? AND org_id=?`,
      [full_name, phone||null, role||null, is_active===undefined ? null : is_active, property_id||null, req.params.id, req.user.org_id]
    );
    if (r.affectedRows === 0) return err(res, 'User not found', 404);

    // Update identity/emergency columns (safe — skipped if column doesn't exist)
    try {
      await pool.query(
        `UPDATE users SET
           id_number=?,
           emergency_contact=?,
           emergency_phone=?,
           vehicle_plate=?
         WHERE id=? AND org_id=?`,
        [id_number||null, emergency_contact||null, emergency_phone||null,
         vehicle_plate ? vehicle_plate.toUpperCase() : null,
         req.params.id, req.user.org_id]
      );
    } catch (_) {}

    // Also sync to tenants table if tenant
    try {
      const [[t]] = await pool.query('SELECT id FROM tenants WHERE user_id=?', [req.params.id]);
      if (t && (emergency_contact !== undefined || emergency_phone !== undefined)) {
        await pool.query(
          'UPDATE tenants SET emergency_contact=COALESCE(?,emergency_contact), emergency_phone=COALESCE(?,emergency_phone), id_number=COALESCE(?,id_number) WHERE user_id=?',
          [emergency_contact||null, emergency_phone||null, id_number||null, req.params.id]
        );
      }
    } catch (_) {}

    ok(res, { message: 'User updated' });
  } catch(e) { err(res, e.message, 500); }
};

exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) return err(res, 'Min 8 characters');
    const hash = await bcrypt.hash(password, 12);
    // SECURITY FIX (most severe finding in this file): previously
    // WHERE id=? with NO org check at all — any authenticated user of
    // any role could reset the password of ANY user in the entire
    // system, in any organisation. This was a full account-takeover
    // primitive. Now scoped, existence-checked, and existing sessions
    // are revoked on reset (a password reset should invalidate old logins).
    const [r] = await pool.query('UPDATE users SET password_hash=? WHERE id=? AND org_id=?',
      [hash, req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'User not found', 404);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id=?', [req.params.id]);
    ok(res, { message: 'Password reset successfully' });
  } catch(e) { err(res, e.message, 500); }
};

// ── NEW: Delete user ──────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);

    // Prevent deleting own account
    if (targetId === req.user.sub) return err(res, 'You cannot delete your own account', 400);

    // SECURITY FIX: previously WHERE id=? with no org check — anyone
    // could delete a user account belonging to a different organisation.
    const [[target]] = await pool.query('SELECT role, full_name FROM users WHERE id=? AND org_id=?', [targetId, req.user.org_id]);
    if (!target) return err(res, 'User not found', 404);

    // Prevent deleting other super admins
    if (target.role === 'super_admin') return err(res, 'Super admin accounts cannot be deleted', 403);

    // Check for active tenancies before deleting tenant
    if (target.role === 'tenant') {
      const [[t]] = await pool.query('SELECT id FROM tenants WHERE user_id=?', [targetId]);
      if (t) {
        const [[activeLease]] = await pool.query(
          "SELECT id FROM tenancies WHERE tenant_id=? AND status='active'", [t.id]);
        if (activeLease) return err(res, 'Cannot delete a tenant with an active tenancy. Terminate the tenancy first.', 400);
      }
    }

    // Use a transaction to safely remove all related data
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      // 1. Revoke sessions
      await conn.query('DELETE FROM refresh_tokens WHERE user_id=?', [targetId]);

      // 2. Safe cleanup: try UPDATE, fallback to DELETE if column is NOT NULL
      const safeNull = async (tbl, col, id) => {
        try { await conn.query('UPDATE ' + tbl + ' SET ' + col + '=NULL WHERE ' + col + '=?', [id]); }
        catch (_) { try { await conn.query('DELETE FROM ' + tbl + ' WHERE ' + col + '=?', [id]); } catch (_2) {} }
      };

      // Clean up all FK references
      await safeNull('case_comments', 'user_id', targetId);
      await safeNull('notifications', 'user_id', targetId);
      await safeNull('cases', 'raised_by', targetId);
      await safeNull('announcements', 'created_by', targetId);
      await safeNull('maintenance_requests', 'assigned_to', targetId);
      await safeNull('maintenance_updates', 'user_id', targetId);
      await safeNull('messages', 'from_user_id', targetId);
      await safeNull('messages', 'to_user_id', targetId);
      await safeNull('visitors', 'registered_by', targetId);
      await safeNull('visitors', 'checked_in_by', targetId);
      await safeNull('payments', 'recorded_by', targetId);
      await safeNull('expenses', 'recorded_by', targetId);
      await safeNull('maintenance_requests', 'reported_by', targetId);

      // 3. If tenant: clean ALL dependent records in correct FK order
      if (target.role === 'tenant') {
        const [[trow]] = await conn.query('SELECT id FROM tenants WHERE user_id=?', [targetId]);
        if (trow) {
          // Get all tenancy IDs for this tenant
          const [tenancyIds] = await conn.query('SELECT id FROM tenancies WHERE tenant_id=?', [trow.id]);
          const ids = tenancyIds.map(r => r.id);

          if (ids.length) {
            const placeholders = ids.map(() => '?').join(',');
            // Clean child records in dependency order (deepest first)
            await conn.query('DELETE FROM tenant_ledger          WHERE tenancy_id IN (' + placeholders + ')', ids).catch(() => {});
            await conn.query('DELETE FROM receipts               WHERE payment_id IN (SELECT id FROM payments WHERE tenancy_id IN (' + placeholders + '))', [...ids]).catch(() => {});
            await conn.query('DELETE FROM payments               WHERE tenancy_id IN (' + placeholders + ')', ids).catch(() => {});
            await conn.query('DELETE FROM invoices               WHERE tenancy_id IN (' + placeholders + ')', ids).catch(() => {});
            await conn.query('DELETE FROM maintenance_requests   WHERE tenancy_id IN (' + placeholders + ')', ids).catch(() => {});
            await conn.query('DELETE FROM deposit_refunds        WHERE tenancy_id IN (' + placeholders + ')', ids).catch(() => {});
            await conn.query('DELETE FROM vacate_notices         WHERE tenancy_id IN (' + placeholders + ')', ids).catch(() => {});
            // Now safe to delete tenancies
            await conn.query('DELETE FROM tenancies WHERE tenant_id=?', [trow.id]);
          }
          await conn.query('DELETE FROM tenants WHERE user_id=?', [targetId]).catch(() => {});
        }
      }

      // 4. Delete the user
      await conn.query('DELETE FROM users WHERE id=? AND org_id=?', [targetId, req.user.org_id]);
      await conn.commit();
      conn.release();
      ok(res, { message: `${target.full_name} has been deleted` });
    } catch (deleteErr) {
      await conn.rollback();
      conn.release();
      throw deleteErr;
    }
  } catch(e) { err(res, e.message, 500); }
};

exports.suspend = async (req, res) => {
  try {
    const { reason } = req.body;
    // SECURITY FIX: previously no org check — anyone could suspend a
    // staff account belonging to a different organisation.
    const [[target]] = await pool.query('SELECT role FROM users WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    if (!target) return err(res, 'User not found', 404);
    if (!['property_manager','caretaker','security'].includes(target.role))
      return err(res, 'Can only suspend managers, caretakers or security staff');
    try {
      await pool.query('UPDATE users SET is_suspended=1,suspended_at=NOW(),suspended_by=?,suspension_reason=?,is_active=0 WHERE id=? AND org_id=?',
        [req.user.sub, reason||null, req.params.id, req.user.org_id]);
    } catch(_) {
      await pool.query('UPDATE users SET is_active=0 WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    }
    await pool.query('DELETE FROM refresh_tokens WHERE user_id=?', [req.params.id]);
    ok(res, { message: 'User suspended' });
  } catch(e) { err(res, e.message, 500); }
};

exports.unsuspend = async (req, res) => {
  try {
    // SECURITY FIX: previously ran unconditionally with no existence or
    // org check at all.
    const [[target]] = await pool.query('SELECT id FROM users WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    if (!target) return err(res, 'User not found', 404);
    try {
      await pool.query('UPDATE users SET is_suspended=0,suspended_at=NULL,suspended_by=NULL,suspension_reason=NULL,is_active=1 WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    } catch(_) {
      await pool.query('UPDATE users SET is_active=1 WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    }
    ok(res, { message: 'User reinstated' });
  } catch(e) { err(res, e.message, 500); }
};

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return err(res, 'No file uploaded');
    const userId = req.params.id || req.user.sub;
    const photoUrl = `/uploads/photos/${req.file.filename}`;
    // SECURITY FIX: when an explicit :id is supplied (admin uploading a
    // photo for someone else) there was no org check — could overwrite
    // another organisation's user's photo.
    const [r] = await pool.query('UPDATE users SET profile_photo=? WHERE id=? AND org_id=?', [photoUrl, userId, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'User not found', 404);
    ok(res, { photo_url: photoUrl, message: 'Photo updated' });
  } catch(e) { err(res, e.message, 500); }
};

exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return ok(res, { results: [] });
    const like = `%${q}%`;
    // SECURITY FIX: neither sub-query filtered by org — search results
    // could surface another organisation's tenants or units.
    const [tenants] = await pool.query(`
      SELECT 'tenant' AS type, u.id, u.full_name AS name, u.email, u.phone,
        un.unit_number, p.name AS property_name
      FROM users u JOIN tenants t ON u.id=t.user_id
      LEFT JOIN tenancies ten ON t.id=ten.tenant_id AND ten.status='active'
      LEFT JOIN units un ON ten.unit_id=un.id
      LEFT JOIN properties p ON un.property_id=p.id
      WHERE u.org_id=? AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?) LIMIT 5`, [req.user.org_id, like,like,like]);
    const [units] = await pool.query(`
      SELECT 'unit' AS type, u.id, CONCAT(u.unit_number,' - ',p.name) AS name, u.status
      FROM units u JOIN properties p ON u.property_id=p.id
      WHERE u.org_id=? AND u.unit_number LIKE ? LIMIT 5`, [req.user.org_id, like]);
    ok(res, { results: [...tenants, ...units] });
  } catch(e) { err(res, e.message, 500); }
};