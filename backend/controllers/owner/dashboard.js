// backend/controllers/owner/dashboard.js
// FIXES:
//   1. "124 occupied (3100%)" — caused by LEFT JOINs multiplying rows
//      across payments+invoices+expenses. Fixed by using separate subqueries.
//   2. "KES -695,950 net income" — expenses was summing ALL historical expenses
//      not just current month. Fixed with proper date filter.
//   3. Outstanding was double-counting due to multi-join cartesian product.

const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getDashboard = async (req, res) => {
  try {
    const owner_id = req.user.sub;

    // ── Properties owned by this user ──────────────────────
    const [properties] = await pool.query(
      'SELECT * FROM properties WHERE owner_id=? ORDER BY name',
      [owner_id]
    );
    if (!properties.length) {
      return ok(res, { properties: [], stats: {}, remittances: [], trend: [] });
    }

    const propIds = properties.map(p => p.id);
    const ph      = propIds.map(() => '?').join(',');

    // ── Unit counts — simple query, no joins ────────────────
    const [[unitStats]] = await pool.query(
      `SELECT
         COUNT(*)                 AS total_units,
         SUM(status = 'occupied') AS occupied,
         SUM(status = 'vacant')   AS vacant
       FROM units
       WHERE property_id IN (${ph})`,
      propIds
    );

    // ── Monthly revenue — payments this calendar month ──────
    const [[revRow]] = await pool.query(
      `SELECT COALESCE(SUM(py.amount), 0) AS monthly_revenue
       FROM payments py
       JOIN tenancies ten ON py.tenancy_id = ten.id
       JOIN units u ON ten.unit_id = u.id
       WHERE u.property_id IN (${ph})
         AND MONTH(py.paid_at) = MONTH(CURDATE())
         AND YEAR(py.paid_at)  = YEAR(CURDATE())`,
      propIds
    );

    // ── Monthly expenses — this calendar month only ─────────
    const [[expRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS monthly_expenses
       FROM expenses
       WHERE property_id IN (${ph})
         AND MONTH(expense_date) = MONTH(CURDATE())
         AND YEAR(expense_date)  = YEAR(CURDATE())`,
      propIds
    );

    // ── Outstanding (unpaid + overdue invoices balance) ─────
    const [[outRow]] = await pool.query(
      `SELECT COALESCE(SUM(i.balance), 0) AS outstanding
       FROM invoices i
       JOIN tenancies ten ON i.tenancy_id = ten.id
       JOIN units u ON ten.unit_id = u.id
       WHERE u.property_id IN (${ph})
         AND i.status IN ('unpaid', 'overdue', 'partial')`,
      propIds
    );

    // ── Revenue trend (last 6 months) ───────────────────────
    const [trend] = await pool.query(
      `SELECT
         DATE_FORMAT(py.paid_at, '%b %Y') AS month,
         DATE_FORMAT(py.paid_at, '%Y-%m') AS period,
         COALESCE(SUM(py.amount), 0)      AS revenue,
         COALESCE((
           SELECT SUM(e.amount)
           FROM expenses e
           WHERE e.property_id IN (${ph})
             AND DATE_FORMAT(e.expense_date, '%Y-%m') = DATE_FORMAT(py.paid_at, '%Y-%m')
         ), 0) AS expenses
       FROM payments py
       JOIN tenancies ten ON py.tenancy_id = ten.id
       JOIN units u ON ten.unit_id = u.id
       WHERE u.property_id IN (${ph})
         AND py.paid_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY period, month
       ORDER BY period`,
      [...propIds, ...propIds]
    );

    // ── Top arrears ─────────────────────────────────────────
    const [arrears] = await pool.query(
      `SELECT
         usr.full_name AS tenant_name, usr.phone,
         un.unit_number, p.name AS property_name,
         SUM(i.balance) AS owed
       FROM invoices i
       JOIN tenancies ten ON i.tenancy_id = ten.id
       JOIN tenants t ON ten.tenant_id = t.id
       JOIN users usr ON t.user_id = usr.id
       JOIN units un ON ten.unit_id = un.id
       JOIN properties p ON un.property_id = p.id
       WHERE p.id IN (${ph})
         AND i.status IN ('unpaid', 'overdue', 'partial')
       GROUP BY ten.id
       ORDER BY owed DESC
       LIMIT 10`,
      propIds
    );

    // ── Active tenants ───────────────────────────────────────
    const [[tenantStats]] = await pool.query(
      `SELECT COUNT(*) AS active_tenants
       FROM tenancies ten
       JOIN units u ON ten.unit_id = u.id
       WHERE u.property_id IN (${ph}) AND ten.status = 'active'`,
      propIds
    );

    // ── Revenue by property (this calendar month) + mgmt fee ─
    // BUG FIX: the frontend (pages/owner/Dashboard.jsx) reads
    // d.by_property, d.active_tenants, d.management_fee, and several
    // other top-level fields — none of which this endpoint ever
    // returned (it nested everything under `stats`, never computed
    // active_tenants/management_fee at all, and never returned a
    // by_property breakdown). Every reference in the frontend fell
    // through to its `|| 0` fallback, which is why the Owner Dashboard
    // showed "KES 0" / all-zero KPIs for an owner who actually has
    // properties, units and revenue (visible correctly on the My
    // Properties page, which calls a different, correctly-shaped
    // endpoint). This computes and returns the fields the frontend
    // actually reads, alongside the existing per-property collected
    // total used for the "Revenue by property" chart.
    const [byPropertyRows] = await pool.query(
      `SELECT p.id, p.name, p.management_fee_pct,
         COALESCE(SUM(py.amount), 0) AS collected
       FROM properties p
       LEFT JOIN units u        ON u.property_id = p.id
       LEFT JOIN tenancies ten  ON ten.unit_id = u.id
       LEFT JOIN payments py    ON py.tenancy_id = ten.id
         AND MONTH(py.paid_at) = MONTH(CURDATE())
         AND YEAR(py.paid_at)  = YEAR(CURDATE())
       WHERE p.id IN (${ph})
       GROUP BY p.id, p.name, p.management_fee_pct
       ORDER BY p.name`,
      propIds
    );
    const by_property = byPropertyRows.map(r => ({ name: r.name, collected: Number(r.collected) || 0 }));
    const management_fee = byPropertyRows.reduce(
      (sum, r) => sum + (Number(r.collected) || 0) * (Number(r.management_fee_pct) || 0) / 100, 0
    );

    // ── Remittance statements ───────────────────────────────
    const [remittances] = await pool.query(
      `SELECT r.*, p.name AS property_name
       FROM owner_remittances r
       JOIN properties p ON r.property_id = p.id
       WHERE r.owner_id = ?
       ORDER BY r.period DESC
       LIMIT 12`,
      [owner_id]
    ).catch(() => [[]]);   // table may not exist yet

    // ── Computed stats ──────────────────────────────────────
    const total_units      = parseInt(unitStats.total_units) || 0;
    const occupied         = parseInt(unitStats.occupied)    || 0;
    const vacant           = parseInt(unitStats.vacant)      || 0;
    const active_tenants   = parseInt(tenantStats.active_tenants) || 0;
    const monthly_revenue  = parseFloat(revRow.monthly_revenue)   || 0;
    const monthly_expenses = parseFloat(expRow.monthly_expenses)  || 0;
    const outstanding      = parseFloat(outRow.outstanding)       || 0;
    const net_income       = monthly_revenue - monthly_expenses;
    const occupancy_rate   = total_units > 0 ? Math.round((occupied / total_units) * 100) : 0;

    ok(res, {
      properties,
      total_properties: properties.length,
      total_units,
      occupied_units: occupied,
      vacant_units: vacant,
      occupancy_rate,
      active_tenants,
      gross_collected: monthly_revenue,
      management_fee,
      total_expenses: monthly_expenses,
      outstanding,
      net_income,
      by_property,
      // Kept for any other consumer relying on the old nested shape.
      stats: {
        total_units, occupied, vacant, occupancy_rate,
        monthly_revenue, monthly_expenses, outstanding, net_income,
      },
      trend,
      arrears,
      remittances: remittances || [],
    });
  } catch (e) {
    global.logger?.error('[Owner Dashboard] Error:', e.message, e.stack);
    err(res, e.message, 500);
  }
};

exports.getRemittances = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, p.name AS property_name
       FROM owner_remittances r
       JOIN properties p ON r.property_id = p.id
       WHERE r.owner_id = ?
       ORDER BY r.period DESC`,
      [req.user.sub]
    );
    ok(res, { remittances: rows });
  } catch (e) {
    err(res, e.message, 500);
  }
};