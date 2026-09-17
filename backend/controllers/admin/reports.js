// backend/controllers/admin/reports.js — property-scoped reports

const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

// ── Scope helper — returns SQL filter + params for role-based property access ──
// alias: the table alias used for `properties` in the calling query (default 'p')
// SECURITY FIX: this had no org_id filter in ANY branch. A super_admin
// hitting these endpoints with no ?property_id (the default dashboard
// call) got the isMgr/isCaret/pid checks all fall through to the last
// branch, which returned an EMPTY filter — every P&L, cash-flow,
// maintenance-KPI and occupancy-trend report was completely unscoped,
// aggregating every property across every organisation on the platform.
// The isMgr/isCaret/explicit-pid branches also each needed org_id added:
// none of them alone confirm the property actually belongs to the
// caller's org (an explicit ?property_id from another org would still
// have been honoured).
function getScope(req, alias) {
  const pid     = req.query.property_id || null;
  const isMgr   = req.user.role === 'property_manager';
  const isCaret = ['caretaker','security'].includes(req.user.role) && req.user.property_id;
  const a       = alias || 'p'; // default alias
  const orgId   = req.user.org_id;

  if (isMgr) {
    return {
      filter:        ` AND ${a}.org_id=? AND ${a}.manager_id=?`,
      filterNoAlias: ' AND properties.org_id=? AND properties.manager_id=?',
      params:        [orgId, req.user.sub],
      pid:           null,
    };
  }
  if (isCaret) {
    return {
      filter:        ` AND ${a}.org_id=? AND ${a}.id=?`,
      filterNoAlias: ' AND properties.org_id=? AND properties.id=?',
      params:        [orgId, req.user.property_id],
      pid:           req.user.property_id,
    };
  }
  if (pid) {
    return {
      filter:        ` AND ${a}.org_id=? AND ${a}.id=?`,
      filterNoAlias: ' AND properties.org_id=? AND properties.id=?',
      params:        [orgId, pid],
      pid,
    };
  }
  return { filter: ` AND ${a}.org_id=?`, filterNoAlias: ' AND properties.org_id=?', params: [orgId], pid: null };
}

// ── P&L Statement ─────────────────────────────────────────────
exports.pnl = async (req, res) => {
  try {
    const month_year = req.query.month_year || new Date().toISOString().slice(0, 7);
    const { filter: propFilter, params: scopeParams } = getScope(req);
    const yr   = month_year.slice(0, 4);
    const mo   = month_year.slice(5, 7);
    const propParams = scopeParams;

    // Revenue: what was billed this month
    const [billed] = await pool.query(`
      SELECT p.id, p.name,
        COALESCE(SUM(i.amount),0) AS gross_billed,
        COALESCE(SUM(CASE WHEN i.status='paid' THEN i.amount ELSE i.amount-i.balance END),0) AS collected,
        COALESCE(SUM(CASE WHEN i.status IN('unpaid','overdue','partial') THEN i.balance ELSE 0 END),0) AS uncollected
      FROM properties p
      LEFT JOIN units u ON p.id=u.property_id
      LEFT JOIN tenancies ten ON u.id=ten.unit_id AND ten.status='active'
      LEFT JOIN invoices i ON ten.id=i.tenancy_id AND YEAR(i.created_at)=? AND MONTH(i.created_at)=?
      WHERE 1=1${propFilter}
      GROUP BY p.id, p.name`, [yr, mo, ...propParams]);

    // Expenses by category
    const [expenses] = await pool.query(`
      SELECT p.id AS property_id, p.name AS property_name,
        e.category, COALESCE(SUM(e.amount),0) AS total
      FROM expenses e JOIN properties p ON e.property_id=p.id
      WHERE YEAR(e.expense_date)=? AND MONTH(e.expense_date)=?${propFilter}
      GROUP BY p.id, p.name, e.category
      ORDER BY p.name, total DESC`, [yr, mo, ...propParams]);

    // Vacancy loss: units that were vacant × rent
    const [vacant] = await pool.query(`
      SELECT p.id, COALESCE(SUM(u.rent_amount),0) AS vacancy_loss
      FROM properties p JOIN units u ON p.id=u.property_id
      WHERE u.status='vacant'${propFilter}
      GROUP BY p.id`, propParams);

    const vacancyMap = Object.fromEntries(vacant.map(v => [v.id, v.vacancy_loss]));

    // Build per-property P&L
    const pnl = billed.map(prop => {
      const propExpenses = expenses.filter(e => e.property_id === prop.id);
      const totalExpenses = propExpenses.reduce((s, e) => s + Number(e.total), 0);
      const mgmtFee = (Number(prop.collected) * Number(prop.management_fee_pct || 0)) / 100;
      const noi = Number(prop.collected) - totalExpenses - mgmtFee;

      return {
        property_id:   prop.id,
        property_name: prop.name,
        gross_billed:  Number(prop.gross_billed),
        collected:     Number(prop.collected),
        uncollected:   Number(prop.uncollected),
        vacancy_loss:  Number(vacancyMap[prop.id] || 0),
        total_expenses: totalExpenses,
        expenses_by_category: propExpenses,
        management_fee: mgmtFee,
        net_operating_income: noi,
        collection_rate: prop.gross_billed > 0 ? Math.round((prop.collected / prop.gross_billed) * 100) : 0,
      };
    });

    const totals = pnl.reduce((acc, p) => {
      acc.gross_billed  += p.gross_billed;
      acc.collected     += p.collected;
      acc.total_expenses += p.total_expenses;
      acc.net_operating_income += p.net_operating_income;
      return acc;
    }, { gross_billed: 0, collected: 0, total_expenses: 0, net_operating_income: 0 });

    ok(res, { month_year, pnl, totals });
  } catch(e) { safeErr(res, e); }
};

// ── 3-Month Cash Flow Forecast ────────────────────────────────
exports.cashflowForecast = async (req, res) => {
  try {
    const { filter: propFilter, params: propParams } = getScope(req);

    // Historical collection rate (last 3 months)
    const [[rateRow]] = await pool.query(`
      SELECT COALESCE(SUM(py.amount),0) AS collected,
             COALESCE(SUM(i.amount),0) AS billed
      FROM invoices i
      JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN units u ON ten.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      LEFT JOIN payments py ON py.invoice_id=i.id
      WHERE i.type='rent' AND i.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
        ${propFilter}`, propParams);

    const collectionRate = rateRow.billed > 0 ? rateRow.collected / rateRow.billed : 0.8;

    // Expected monthly rent from active tenancies
    const [[rentRow]] = await pool.query(`
      SELECT COALESCE(SUM(ten.rent_amount),0) AS expected_rent
      FROM tenancies ten
      JOIN units u ON ten.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE ten.status='active'${propFilter}`, propParams);

    const expectedRent = Number(rentRow.expected_rent) * collectionRate;

    // Average monthly expenses (last 3 months)
    const [[expRow]] = await pool.query(`
      SELECT COALESCE(SUM(e.amount),0)/3 AS avg_monthly
      FROM expenses e
      JOIN properties p ON e.property_id=p.id
      WHERE e.expense_date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
        ${propFilter}`, propParams);

    const avgExpenses = Number(expRow.avg_monthly);

    // Build 3-month forecast
    const forecast = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i, 1);
      const month = d.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
      const income   = Math.round(expectedRent);
      const expenses = Math.round(avgExpenses);
      forecast.push({
        month,
        projected_income:   income,
        projected_expenses: expenses,
        net:                income - expenses,
        status:             income - expenses >= 0 ? 'surplus' : 'shortfall',
      });
    }

    ok(res, {
      forecast,
      collection_rate: Math.round(collectionRate * 100),
      expected_monthly_rent: Math.round(expectedRent),
      avg_monthly_expenses: Math.round(avgExpenses),
    });
  } catch(e) { safeErr(res, e); }
};

// ── Maintenance KPIs ──────────────────────────────────────────
exports.maintenanceKpis = async (req, res) => {
  try {
    const { filter: pf, params: pp } = getScope(req);

    // Avg resolution time by category
    const [byCategory] = await pool.query(`
      SELECT mr.category,
        COUNT(*) AS total,
        AVG(CASE WHEN mr.resolved_at IS NOT NULL
            THEN TIMESTAMPDIFF(HOUR, mr.created_at, mr.resolved_at) END) AS avg_hours,
        SUM(CASE WHEN mr.status IN('open','assigned','in_progress') THEN 1 ELSE 0 END) AS open_count,
        COALESCE(SUM(mr.cost),0) AS total_cost
      FROM maintenance_requests mr
      JOIN units u ON mr.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE mr.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)${pf}
      GROUP BY mr.category ORDER BY total DESC`, pp);

    // SLA compliance by priority
    // FIX: the query had only ONE `?` placeholder (a single fixed
    // threshold) but Object.values(SLA) spread 4 values into the params
    // array ahead of the scope filter's own params — positionally, the
    // filter's placeholder (manager_id/property_id/org_id) then bound to
    // one of the SLA hour counts instead of the real ID, so isMgr/
    // isCaret/pid-scoped calls silently matched the wrong row (or none).
    // Moved the per-priority threshold into a SQL CASE expression so no
    // SLA values need to be bound as params at all.
    const SLA = { emergency: 2, urgent: 24, normal: 72, low: 168 };
    const [byPriority] = await pool.query(`
      SELECT mr.priority, COUNT(*) AS total,
        SUM(CASE WHEN mr.resolved_at IS NOT NULL
                  AND TIMESTAMPDIFF(HOUR,mr.created_at,mr.resolved_at) <= CASE mr.priority
                    WHEN 'emergency' THEN ${SLA.emergency}
                    WHEN 'urgent'    THEN ${SLA.urgent}
                    WHEN 'normal'    THEN ${SLA.normal}
                    ELSE ${SLA.low} END
                  THEN 1 ELSE 0 END) AS within_sla
      FROM maintenance_requests mr
      JOIN units u ON mr.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE mr.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)${pf}
      GROUP BY mr.priority`, pp);

    // Top problem units
    const [topUnits] = await pool.query(`
      SELECT un.unit_number, p.name AS property_name,
        COUNT(mr.id) AS request_count,
        COALESCE(SUM(mr.cost),0) AS total_cost
      FROM maintenance_requests mr
      JOIN units un ON mr.unit_id=un.id
      JOIN properties p ON un.property_id=p.id
      WHERE mr.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)${pf}
      GROUP BY un.id, un.unit_number, p.name ORDER BY request_count DESC LIMIT 10`, pp);

    // Monthly trend
    const [monthlyTrend] = await pool.query(`
      SELECT DATE_FORMAT(mr.created_at,'%b') AS month,
             DATE_FORMAT(mr.created_at,'%Y-%m') AS period,
             COUNT(*) AS requests,
             SUM(CASE WHEN mr.status IN('completed','closed') THEN 1 ELSE 0 END) AS resolved
      FROM maintenance_requests mr
      JOIN units u ON mr.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE mr.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)${pf}
      GROUP BY period,month ORDER BY period`, pp);

    const [[overall]] = await pool.query(`
      SELECT COUNT(*) AS total,
        AVG(CASE WHEN mr.resolved_at IS NOT NULL
            THEN TIMESTAMPDIFF(HOUR,mr.created_at,mr.resolved_at) END) AS avg_resolution_hours,
        COALESCE(SUM(mr.cost),0) AS total_cost
      FROM maintenance_requests mr
      JOIN units u ON mr.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE mr.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)${pf}`, pp);

    ok(res, { byCategory, byPriority, topUnits, monthlyTrend, overall });
  } catch(e) { safeErr(res, e); }
};

// ── Occupancy Trend ───────────────────────────────────────────
exports.occupancyTrend = async (req, res) => {
  try {
    const { filter: occFilter, params: occParams, pid } = getScope(req);

    // Snapshot occupancy per month
    const [trend] = await pool.query(`
      SELECT DATE_FORMAT(pay_date,'%b') AS month,
             DATE_FORMAT(pay_date,'%Y-%m') AS period,
             COUNT(DISTINCT ten.unit_id) AS occupied_units
      FROM (SELECT DISTINCT DATE_FORMAT(paid_at,'%Y-%m-01') AS pay_date, tenancy_id
            FROM payments WHERE paid_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)) p_sub
      JOIN tenancies ten ON p_sub.tenancy_id=ten.id
      JOIN units u ON ten.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE 1=1${occFilter}
      GROUP BY period,month ORDER BY period`, occParams);

    const [[unitTotal]] = await pool.query(
      `SELECT COUNT(*) AS total FROM units u JOIN properties p ON u.property_id=p.id WHERE 1=1${occFilter}`,
      occParams);

    // By unit type
    const [byType] = await pool.query(`
      SELECT u.type,
        COUNT(*) AS total,
        SUM(u.status='occupied') AS occupied,
        AVG(u.rent_amount) AS avg_rent
      FROM units u
      JOIN properties p ON u.property_id=p.id
      WHERE 1=1${occFilter}
      GROUP BY u.type`, occParams);

    ok(res, {
      trend: trend.map(t => ({
        ...t,
        total_units: unitTotal.total,
        occupancy_rate: Math.round((t.occupied_units / (unitTotal.total || 1)) * 100),
      })),
      byType,
      current_total: unitTotal.total,
    });
  } catch(e) { safeErr(res, e); }
};

// ── Waive late fee ────────────────────────────────────────────
exports.waiveLateFee = async (req, res) => {
  try {
    const [[inv]] = await pool.query(
      "SELECT * FROM invoices WHERE id=? AND type='penalty'", [req.params.id]);
    if (!inv) return err(res, 'Penalty invoice not found', 404);

    await pool.query(
      "UPDATE invoices SET status='cancelled', notes=CONCAT(IFNULL(notes,''), ' | Waived by admin on ', CURDATE()) WHERE id=?",
      [inv.id]);
    ok(res, { message: 'Late fee waived' });
  } catch(e) { safeErr(res, e); }
};