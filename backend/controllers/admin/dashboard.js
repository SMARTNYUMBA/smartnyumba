// backend/controllers/admin/dashboard.js
// FIXES:
//   1. visitors table uses `check_in` column not `check_in_time`
//   2. All numeric values cast correctly
//   3. Manager scoped to their property_id via req.user.property_id

const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getDashboard = async (req, res) => {
  try {
    // SECURITY FIX: this entire function had no org_id scoping anywhere.
    // For super_admin/caretaker/security calling with no ?property_id —
    // the DEFAULT dashboard load — every query fell through to an
    // unfiltered branch, aggregating unit counts, revenue, outstanding
    // balances, and "top arrears" (tenant names + phone numbers!) across
    // EVERY organisation on the entire platform. An explicit
    // ?property_id also was never checked against the caller's org.
    const orgId = req.user.org_id;

    // Determine property scope based on role
    let pid = req.query.property_id || null;

    if (pid) {
      const propCheckSql = req.user.role === 'property_manager'
        ? 'SELECT id FROM properties WHERE id=? AND org_id=? AND manager_id=?'
        : 'SELECT id FROM properties WHERE id=? AND org_id=?';
      const propCheckParams = req.user.role === 'property_manager'
        ? [pid, orgId, req.user.sub] : [pid, orgId];
      // FIX: previously a property_manager passing an explicit
      // ?property_id was never checked for actually managing it — a
      // `managerFilter` variable was computed but never used in any
      // query, so any manager could view any property's dashboard data
      // just by supplying its ID.
      const [[prop]] = await pool.query(propCheckSql, propCheckParams);
      if (!prop) return err(res, 'Property not found', 404);
    }

    let pidParam = pid ? [pid, orgId] : [orgId];
    let managerParams = [req.user.sub, orgId];

    if (req.user.role === 'property_manager') {
      // pid (if any) was already confirmed above to belong to this manager
    } else if (req.user.property_id && ['caretaker','security'].includes(req.user.role)) {
      pid = req.user.property_id;
      pidParam = [pid, orgId];
    }

    const isMgr = req.user.role === 'property_manager' && !pid;

    // ── Unit stats ──────────────────────────────────────────
    const [[unitStats]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status='occupied') AS occupied,
         SUM(status='vacant')   AS vacant
       FROM units u
       ${isMgr ? 'JOIN properties p ON u.property_id=p.id WHERE p.manager_id=? AND p.org_id=?' :
         pid   ? 'WHERE u.property_id=? AND u.org_id=?' : 'WHERE u.org_id=?'}`,
      isMgr ? managerParams : pidParam
    );

    // ── Active tenancies ────────────────────────────────────
    const [[tenStats]] = await pool.query(
      `SELECT
         COUNT(DISTINCT ten.id)        AS leases,
         COUNT(DISTINCT ten.tenant_id) AS tenants
       FROM tenancies ten
       JOIN units un ON ten.unit_id = un.id
       WHERE ten.status = 'active'
         ${isMgr ? 'AND un.property_id IN (SELECT id FROM properties WHERE manager_id=? AND org_id=?)' :
           pid   ? 'AND un.property_id=? AND ten.org_id=?' : 'AND ten.org_id=?'}`,
      isMgr ? managerParams : pidParam
    );

    // ── Monthly revenue (current month) ────────────────────
    const [[revenue]] = await pool.query(
      `SELECT COALESCE(SUM(py.amount), 0) AS monthly
       FROM payments py
       JOIN tenancies ten ON py.tenancy_id = ten.id
       JOIN units un ON ten.unit_id = un.id
       WHERE MONTH(py.paid_at) = MONTH(CURDATE())
         AND YEAR(py.paid_at)  = YEAR(CURDATE())
         ${isMgr ? 'AND un.property_id IN (SELECT id FROM properties WHERE manager_id=? AND org_id=?)' :
           pid   ? 'AND un.property_id=? AND py.org_id=?' : 'AND py.org_id=?'}`,
      isMgr ? managerParams : pidParam
    );

    // ── Outstanding balances ────────────────────────────────
    const [[outstanding]] = await pool.query(
      `SELECT
         COALESCE(SUM(i.balance), 0)                              AS owed,
         COUNT(CASE WHEN i.status='overdue' THEN 1 END)           AS overdue
       FROM invoices i
       JOIN tenancies ten ON i.tenancy_id = ten.id
       JOIN units un ON ten.unit_id = un.id
       WHERE i.status IN ('unpaid','overdue','partial')
         ${isMgr ? 'AND un.property_id IN (SELECT id FROM properties WHERE manager_id=? AND org_id=?)' :
           pid   ? 'AND un.property_id=? AND i.org_id=?' : 'AND i.org_id=?'}`,
      isMgr ? managerParams : pidParam
    );

    // ── Property count ──────────────────────────────────────
    const [[propCount]] = await pool.query(
      `SELECT COUNT(*) AS total FROM properties${isMgr ? ' WHERE manager_id=? AND org_id=?' : pid ? ' WHERE id=? AND org_id=?' : ' WHERE org_id=?'}`,
      isMgr ? managerParams : pidParam
    );

    // ── Open maintenance ────────────────────────────────────
    const [[maintCount]] = await pool.query(
      `SELECT COUNT(*) AS open
       FROM maintenance_requests
       WHERE status IN ('open','assigned','in_progress')
         ${isMgr ? 'AND property_id IN (SELECT id FROM properties WHERE manager_id=? AND org_id=?)' :
           pid   ? 'AND property_id=? AND org_id=?' : 'AND org_id=?'}`,
      isMgr ? managerParams : pidParam
    );

    // ── Visitors today — try both column name variants ──────
    // Scoped through properties since `visitors` carries its own org_id.
    let visitorsToday = 0;
    const visParams = isMgr ? managerParams : pidParam;
    const visFilter = isMgr ? 'v.property_id IN (SELECT id FROM properties WHERE manager_id=? AND org_id=?)' :
                       pid ? 'v.property_id=? AND v.org_id=?' : 'v.org_id=?';
    try {
      const [[v1]] = await pool.query(
        `SELECT COUNT(*) AS today FROM visitors v WHERE DATE(v.check_in) = CURDATE() AND ${visFilter}`, visParams
      );
      visitorsToday = parseInt(v1.today) || 0;
    } catch (_) {
      try {
        const [[v2]] = await pool.query(
          `SELECT COUNT(*) AS today FROM visitors v WHERE DATE(v.check_in_time) = CURDATE() AND ${visFilter}`, visParams
        );
        visitorsToday = parseInt(v2.today) || 0;
      } catch (_2) { visitorsToday = 0; }
    }

    const total         = parseInt(unitStats.total)    || 0;
    const occupied      = parseInt(unitStats.occupied) || 0;
    const occupancy_rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    // ── Revenue trend (last 6 months) ───────────────────────
    const [trend] = await pool.query(
      `SELECT
         DATE_FORMAT(py.paid_at, '%b')    AS month,
         DATE_FORMAT(py.paid_at, '%Y-%m') AS period,
         COALESCE(SUM(py.amount), 0)      AS revenue
       FROM payments py
       JOIN tenancies ten ON py.tenancy_id = ten.id
       JOIN units un ON ten.unit_id = un.id
       WHERE py.paid_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
         ${isMgr ? 'AND un.property_id IN (SELECT id FROM properties WHERE manager_id=? AND org_id=?)' :
           pid   ? 'AND un.property_id=? AND py.org_id=?' : 'AND py.org_id=?'}
       GROUP BY period, month
       ORDER BY period`,
      isMgr ? managerParams : pidParam
    );

    // ── Per-property breakdown ──────────────────────────────
    const [by_property] = await pool.query(
      `SELECT
         p.id, p.name,
         COUNT(u.id)              AS total,
         SUM(u.status='occupied') AS occupied,
         COALESCE((
           SELECT SUM(py2.amount)
           FROM payments py2
           JOIN tenancies t2 ON py2.tenancy_id = t2.id
           JOIN units u2 ON t2.unit_id = u2.id
           WHERE u2.property_id = p.id
             AND MONTH(py2.paid_at) = MONTH(CURDATE())
             AND YEAR(py2.paid_at)  = YEAR(CURDATE())
         ), 0) AS collected,
         COALESCE((
           SELECT SUM(i2.balance)
           FROM invoices i2
           JOIN tenancies t2 ON i2.tenancy_id = t2.id
           JOIN units u2 ON t2.unit_id = u2.id
           WHERE u2.property_id = p.id
             AND i2.status IN ('unpaid','overdue')
         ), 0) AS owed
       FROM properties p
       LEFT JOIN units u ON p.id = u.property_id
       ${isMgr ? 'WHERE p.manager_id=? AND p.org_id=?' : pid ? 'WHERE p.id=? AND p.org_id=?' : 'WHERE p.org_id=?'}
       GROUP BY p.id
       ORDER BY p.name`,
      isMgr ? managerParams : pidParam
    );

    // ── Top arrears ─────────────────────────────────────────
    const [top_arrears] = await pool.query(
      `SELECT
         usr.full_name AS tenant_name, usr.phone,
         un.unit_number, p.name AS property_name,
         SUM(i.balance) AS total_owed,
         MAX(DATEDIFF(CURDATE(), i.due_date)) AS days_overdue
       FROM invoices i
       JOIN tenancies ten ON i.tenancy_id = ten.id
       JOIN tenants t ON ten.tenant_id = t.id
       JOIN users usr ON t.user_id = usr.id
       JOIN units un ON ten.unit_id = un.id
       JOIN properties p ON un.property_id = p.id
       WHERE i.status IN ('unpaid','overdue')
         ${isMgr ? 'AND p.manager_id=? AND p.org_id=?' :
            pid   ? 'AND un.property_id=? AND i.org_id=?' : 'AND i.org_id=?'}
       GROUP BY ten.id
       ORDER BY total_owed DESC
       LIMIT 5`,
      isMgr ? managerParams : pidParam
    );

    // ── Open maintenance (list) ─────────────────────────────
    const [open_requests] = await pool.query(
      `SELECT mr.title, mr.priority, mr.status,
              un.unit_number, p.name AS property_name
       FROM maintenance_requests mr
       JOIN units un ON mr.unit_id = un.id
       JOIN properties p ON un.property_id = p.id
       WHERE mr.status IN ('open','assigned','in_progress')
         ${isMgr ? 'AND p.manager_id=? AND p.org_id=?' : pid ? 'AND mr.property_id=? AND mr.org_id=?' : 'AND mr.org_id=?'}
       ORDER BY FIELD(mr.priority,'emergency','urgent','normal','low')
       LIMIT 5`,
      isMgr ? managerParams : pidParam
    );

    const result = {
      total_units:      total,
      occupied_units:   occupied,
      vacant_units:     parseInt(unitStats.vacant)       || 0,
      active_leases:    parseInt(tenStats.leases)        || 0,
      active_tenants:   parseInt(tenStats.tenants)       || 0,
      monthly_revenue:  parseFloat(revenue.monthly)      || 0,
      outstanding:      parseFloat(outstanding.owed)     || 0,
      overdue_invoices: parseInt(outstanding.overdue)    || 0,
      total_properties: parseInt(propCount.total)        || 0,
      open_maintenance: parseInt(maintCount.open)        || 0,
      visitors_today:   visitorsToday,
      occupancy_rate,
      revenue_trend:    trend,
      by_property,
      top_arrears,
      open_requests,
    };

    ok(res, result);
  } catch (e) {
    global.logger?.error('[Dashboard] Error:', e.message, e.stack);
    err(res, e.message, 500);
  }
};