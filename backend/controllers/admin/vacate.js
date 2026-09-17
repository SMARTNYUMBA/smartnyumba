const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    let sql = `SELECT vn.*,u.full_name AS tenant_name,u.phone,un.unit_number,pr.name AS property_name
      FROM vacate_notices vn JOIN tenancies ten ON vn.tenancy_id=ten.id
      JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
      JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
      WHERE ten.org_id=?`;
    const params = [req.user.org_id]; // SECURITY FIX: no org filter previously.
    if (req.user.role === 'tenant') {
      sql += ' AND t.user_id=?'; params.push(req.user.sub);
    }
    if (req.query.property_id) { sql += ' AND pr.id=?'; params.push(req.query.property_id); }
    if (req.query.status)      { sql += ' AND vn.status=?'; params.push(req.query.status); }
    if (req.user.role === 'property_manager' && req.user.property_id) {
      sql += ' AND pr.id=?'; params.push(req.user.property_id);
    }
    sql += ' ORDER BY vn.created_at DESC';
    const [rows] = await pool.query(sql, params);
    ok(res, { notices: rows });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { tenancy_id,vacate_date,reason } = req.body;
    if (!tenancy_id||!vacate_date) return err(res, 'tenancy_id and vacate_date required');
    // SECURITY FIX: tenancy_id came from the request body unvalidated —
    // could file a vacate notice against (and flip the status of)
    // another organisation's tenancy.
    const [[ten]] = await pool.query('SELECT id FROM tenancies WHERE id=? AND org_id=?', [tenancy_id, req.user.org_id]);
    if (!ten) return err(res, 'Tenancy not found', 404);
    // BUG FIX: this INSERT never set org_id — same silently-stamped-
    // org_id=1 pattern found and fixed repeatedly elsewhere this session
    // (cron.js's applyLateFees/generateMonthlyInvoices/
    // processRecurringExpenses, services/mpesa.js's payment insert).
    // vacate_notices has an org_id column (migration 006) that this
    // never populated.
    const [r] = await pool.query('INSERT INTO vacate_notices (tenancy_id,notice_date,vacate_date,reason,org_id) VALUES (?,CURDATE(),?,?,?)',
      [tenancy_id, vacate_date, reason||null, req.user.org_id]);
    await pool.query("UPDATE tenancies SET status='notice_given' WHERE id=? AND org_id=?", [tenancy_id, req.user.org_id]);
    // FEATURE: fire vacate_notice.filed for org webhook subscribers.
    require('../../services/webhooks').deliverEvent('vacate_notice.filed', {
      notice_id: r.insertId, tenancy_id, vacate_date, reason: reason || null,
    }, req.user.org_id);
    ok(res, { id: r.insertId, message: 'Vacate notice submitted' }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.update = async (req, res) => {
  try {
    const { status, notes } = req.body;
    // FIX: this previously ran an ALTER TABLE ... ADD COLUMN IF NOT
    // EXISTS on every single call to this endpoint — needless DDL on a
    // hot path (risking metadata-lock contention under load), and
    // `ADD COLUMN IF NOT EXISTS` isn't supported before MySQL 8.0.29
    // despite this codebase targeting 5.7+ elsewhere. It's also fully
    // redundant: scripts/auto_migrate.js's migrateVacateNotices() already
    // adds acknowledged_by/acknowledged_at/notes once at server startup.
    // SECURITY FIX: previously no ownership check at all — anyone could
    // acknowledge/update another organisation's vacate notice by ID.
    const [r] = await pool.query(
      `UPDATE vacate_notices vn
       JOIN tenancies ten ON vn.tenancy_id = ten.id
       SET vn.status=?, vn.acknowledged_by=?, vn.acknowledged_at=NOW(), vn.notes=?
       WHERE vn.id=? AND ten.org_id=?`,
      [status, req.user.sub, notes || null, req.params.id, req.user.org_id]
    );
    if (r.affectedRows === 0) return err(res, 'Vacate notice not found', 404);
    ok(res, { message: 'Notice updated' });
  } catch(e) { safeErr(res, e); }
};
