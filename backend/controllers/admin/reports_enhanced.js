// backend/controllers/admin/reports_enhanced.js
'use strict';

const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

// ── Scope helper — org + role-based property access ────────────
// SECURITY FIX: none of the functions below had ANY scoping — not org_id,
// not manager_id, not owner_id. This route is open to super_admin,
// property_manager AND owner (routes/reports.js: REPORT_ROLES), so any
// property_manager or owner on the platform could pull full P&L,
// cash-flow forecasts, maintenance costs, and occupancy data for every
// property across every organisation, not just their own.
function getScope(req, alias) {
  const pid   = req.query.property_id || null;
  const a     = alias || 'p';
  const orgId = req.user.org_id;
  const clauses = [`${a}.org_id=?`];
  const params  = [orgId];
  if (req.user.role === 'property_manager') {
    clauses.push(`${a}.manager_id=?`); params.push(req.user.sub);
  } else if (req.user.role === 'owner') {
    clauses.push(`${a}.owner_id=?`); params.push(req.user.sub);
  }
  if (pid) { clauses.push(`${a}.id=?`); params.push(pid); }
  return { filter: ' AND ' + clauses.join(' AND '), params };
}

// ── P&L Statement ─────────────────────────────────────────────
const pnl = async (req, res) => {
  try {
    const month_year = req.query.month_year || new Date().toISOString().slice(0, 7);
    const yr = month_year.slice(0, 4);
    const mo = month_year.slice(5, 7);
    const { filter: propFilter, params: propParams } = getScope(req);

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
      GROUP BY p.id, p.name
    `, [yr, mo, ...propParams]);

    const [expenses] = await pool.query(`
      SELECT p.id AS property_id, p.name AS property_name,
        e.category, COALESCE(SUM(e.amount),0) AS total
      FROM expenses e JOIN properties p ON e.property_id=p.id
      WHERE YEAR(e.expense_date)=? AND MONTH(e.expense_date)=?${propFilter}
      GROUP BY p.id, p.name, e.category
      ORDER BY p.name, total DESC
    `, [yr, mo, ...propParams]);

    const [vacant] = await pool.query(`
      SELECT p.id, COALESCE(SUM(u.rent_amount),0) AS vacancy_loss
      FROM properties p JOIN units u ON p.id=u.property_id
      WHERE u.status='vacant'${propFilter}
      GROUP BY p.id
    `, propParams);

    // BUG FIX: the frontend's P&L tab has always expected income_breakdown,
    // expense_breakdown, and a totals-level vacancy_loss — none of which
    // this endpoint ever returned (only a per-property vacancy_loss, and
    // expenses_by_category per property, never aggregated portfolio-wide).
    // Every KPI card and both breakdown panels on that tab were reading
    // undefined the whole time. expenses_by_category per property was
    // already being computed below; this adds the portfolio-wide roll-up.
    const [incomeByType] = await pool.query(`
      SELECT i.type, COALESCE(SUM(i.amount),0) AS amount
      FROM invoices i
      JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN units u ON ten.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE YEAR(i.created_at)=? AND MONTH(i.created_at)=?${propFilter}
      GROUP BY i.type ORDER BY amount DESC
    `, [yr, mo, ...propParams]);

    const vacancyMap = Object.fromEntries(vacant.map(v => [v.id, v.vacancy_loss]));

    const pnlResult = billed.map(prop => {
      const propExpenses = expenses.filter(e => e.property_id === prop.id);
      const totalExpenses = propExpenses.reduce((s, e) => s + Number(e.total), 0);
      const mgmtFee = 0; // placeholder
      const noi = Number(prop.collected) - totalExpenses - mgmtFee;

      return {
        property_id: prop.id,
        property_name: prop.name,
        gross_billed: Number(prop.gross_billed),
        collected: Number(prop.collected),
        uncollected: Number(prop.uncollected),
        vacancy_loss: Number(vacancyMap[prop.id] || 0),
        total_expenses: totalExpenses,
        expenses_by_category: propExpenses,
        management_fee: mgmtFee,
        net_operating_income: noi,
        collection_rate: prop.gross_billed > 0 ? Math.round((prop.collected / prop.gross_billed) * 100) : 0,
      };
    });

    const totals = pnlResult.reduce((acc, p) => {
      acc.gross_billed += p.gross_billed;
      acc.collected += p.collected;
      acc.total_expenses += p.total_expenses;
      acc.net_operating_income += p.net_operating_income;
      acc.vacancy_loss += p.vacancy_loss;
      return acc;
    }, { gross_billed: 0, collected: 0, total_expenses: 0, net_operating_income: 0, vacancy_loss: 0 });

    // Portfolio-wide expense breakdown — roll up the per-property
    // expenses_by_category rows (already fetched above) by category alone.
    const expenseByCategory = {};
    for (const e of expenses) {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.total);
    }
    const expense_breakdown = Object.entries(expenseByCategory)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const income_breakdown = incomeByType.map(r => ({ type: r.type, amount: Number(r.amount) }));

    ok(res, {
      month_year, pnl: pnlResult, totals,
      // Flat aliases matching what the frontend's KPI cards read directly
      // (pnl.gross_income etc.) — the per-property `pnl` array and
      // `totals` object remain for the portfolio comparison/detail views.
      gross_income: totals.gross_billed,
      total_expenses: totals.total_expenses,
      net_income: totals.net_operating_income,
      vacancy_loss: totals.vacancy_loss,
      income_breakdown, expense_breakdown,
    });
  } catch(e) { safeErr(res, e); }
};

// ── Cashflow Forecast ─────────────────────────────────────────
const cashflowForecast = async (req, res) => {
  try {
    const { filter: propFilter, params: propParams } = getScope(req);

    const [[rateRow]] = await pool.query(`
      SELECT COALESCE(SUM(py.amount),0) AS collected,
             COALESCE(SUM(i.amount),0) AS billed
      FROM invoices i
      JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN units u ON ten.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      LEFT JOIN payments py ON py.invoice_id=i.id
      WHERE i.type='rent' AND i.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
        ${propFilter}
    `, propParams);

    const collectionRate = rateRow.billed > 0 ? rateRow.collected / rateRow.billed : 0.8;

    const [[rentRow]] = await pool.query(`
      SELECT COALESCE(SUM(ten.rent_amount),0) AS expected_rent
      FROM tenancies ten JOIN units u ON ten.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE ten.status='active'${propFilter}
    `, propParams);

    const expectedRent = Number(rentRow.expected_rent) * collectionRate;

    const [[expRow]] = await pool.query(`
      SELECT COALESCE(SUM(e.amount),0)/3 AS avg_monthly
      FROM expenses e JOIN properties p ON e.property_id=p.id
      WHERE e.expense_date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
        ${propFilter}
    `, propParams);

    const avgExpenses = Number(expRow.avg_monthly);

    const forecast = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i, 1);
      const month = d.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
      forecast.push({
        month,
        projected_income: Math.round(expectedRent),
        projected_expenses: Math.round(avgExpenses),
        net: Math.round(expectedRent - avgExpenses),
        status: expectedRent - avgExpenses >= 0 ? 'surplus' : 'shortfall',
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

// ── Maintenance KPIs ─────────────────────────────────────────
const maintenanceKpis = async (req, res) => {
  try {
    const { filter: pf, params: pp } = getScope(req);

    const [byCategory] = await pool.query(`
      SELECT mr.category,
        COUNT(*) AS total,
        AVG(CASE WHEN mr.resolved_at IS NOT NULL
            THEN TIMESTAMPDIFF(HOUR, mr.created_at, mr.resolved_at) END) AS avg_hours,
        SUM(CASE WHEN mr.status IN('open','assigned','in_progress') THEN 1 ELSE 0 END) AS open_count,
        COALESCE(SUM(mr.cost),0) AS total_cost
      FROM maintenance_requests mr
      JOIN properties p ON mr.property_id=p.id
      WHERE mr.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)${pf}
      GROUP BY mr.category ORDER BY total DESC
    `, pp);

    // BUG FIX: the frontend's Maintenance tab has always read maint.overall
    // and maint.topUnits — neither existed on this response, only
    // byCategory, so those KPI cards and the "Top problem units" panel
    // showed 0/blank the whole time.
    const overall = byCategory.reduce((acc, c) => {
      acc.total += Number(c.total);
      acc.total_cost += Number(c.total_cost);
      acc._hourSum += (c.avg_hours || 0) * Number(c.total);
      acc._hourCount += c.avg_hours !== null ? Number(c.total) : 0;
      return acc;
    }, { total: 0, total_cost: 0, _hourSum: 0, _hourCount: 0 });
    overall.avg_resolution_hours = overall._hourCount > 0 ? overall._hourSum / overall._hourCount : null;
    delete overall._hourSum; delete overall._hourCount;

    const [topUnits] = await pool.query(`
      SELECT u.unit_number, p.name AS property_name,
        COUNT(*) AS request_count, COALESCE(SUM(mr.cost),0) AS total_cost
      FROM maintenance_requests mr
      JOIN properties p ON mr.property_id=p.id
      LEFT JOIN units u ON mr.unit_id=u.id
      WHERE mr.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        AND mr.unit_id IS NOT NULL${pf}
      GROUP BY u.id, u.unit_number, p.name
      ORDER BY request_count DESC LIMIT 5
    `, pp);

    ok(res, { byCategory, overall, topUnits });
  } catch(e) { safeErr(res, e); }
};

// ── Occupancy Trend ──────────────────────────────────────────
const occupancyTrend = async (req, res) => {
  try {
    const { filter: pf, params: pp } = getScope(req, 'p');

    const [trend] = await pool.query(`
      SELECT DATE_FORMAT(pay_date,'%b') AS month,
             DATE_FORMAT(pay_date,'%Y-%m') AS period,
             COUNT(DISTINCT ten.unit_id) AS occupied_units
      FROM (SELECT DISTINCT DATE_FORMAT(paid_at,'%Y-%m-01') AS pay_date, tenancy_id
            FROM payments WHERE paid_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)) p_sub
      JOIN tenancies ten ON p_sub.tenancy_id=ten.id
      JOIN units u ON ten.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE 1=1${pf}
      GROUP BY period,month ORDER BY period
    `, pp);

    const [[unitTotal]] = await pool.query(
      `SELECT COUNT(*) AS total FROM units u JOIN properties p ON u.property_id=p.id WHERE 1=1${pf}`, pp);

    // BUG FIX: the frontend's "Occupancy by unit type" table has always
    // read occ.byType, which this endpoint never returned — the table
    // silently rendered empty (no crash, just always blank).
    const [byType] = await pool.query(`
      SELECT u.type,
        COUNT(*) AS total,
        SUM(CASE WHEN u.status='occupied' THEN 1 ELSE 0 END) AS occupied,
        COALESCE(AVG(u.rent_amount),0) AS avg_rent
      FROM units u JOIN properties p ON u.property_id=p.id
      WHERE 1=1${pf}
      GROUP BY u.type ORDER BY total DESC
    `, pp);

    ok(res, {
      trend: trend.map(t => ({
        ...t,
        total_units: unitTotal.total,
        occupancy_rate: Math.round((t.occupied_units / (unitTotal.total || 1)) * 100),
      })),
      current_total: unitTotal.total,
      byType: byType.map(t => ({
        type: t.type, total: t.total, occupied: t.occupied, avg_rent: Number(t.avg_rent),
      })),
    });
  } catch(e) { safeErr(res, e); }
};

// ── Portfolio Overview — cross-property comparison ─────────────
// New: every existing report here (pnl, cashflow, maintenance, occupancy)
// is either scoped to a single property or aggregated across the whole
// portfolio into one number — there was no way to compare properties
// against each other side by side ("which of my properties is actually
// underperforming"), which is the most basic BI question a portfolio
// owner or manager actually asks. This answers it directly.
const portfolioOverview = async (req, res) => {
  try {
    const month_year = req.query.month_year || new Date().toISOString().slice(0, 7);
    const yr = month_year.slice(0, 4);
    const mo = month_year.slice(5, 7);
    const { filter: propFilter, params: propParams } = getScope(req);

    const [billed] = await pool.query(`
      SELECT p.id, p.name,
        COALESCE(SUM(i.amount),0) AS gross_billed,
        COALESCE(SUM(CASE WHEN i.status='paid' THEN i.amount ELSE i.amount-i.balance END),0) AS collected
      FROM properties p
      LEFT JOIN units u ON p.id=u.property_id
      LEFT JOIN tenancies ten ON u.id=ten.unit_id AND ten.status='active'
      LEFT JOIN invoices i ON ten.id=i.tenancy_id AND YEAR(i.created_at)=? AND MONTH(i.created_at)=?
      WHERE 1=1${propFilter}
      GROUP BY p.id, p.name
    `, [yr, mo, ...propParams]);

    const [expenses] = await pool.query(`
      SELECT p.id, COALESCE(SUM(e.amount),0) AS total_expenses
      FROM properties p LEFT JOIN expenses e ON e.property_id=p.id
        AND YEAR(e.expense_date)=? AND MONTH(e.expense_date)=?
      WHERE 1=1${propFilter}
      GROUP BY p.id
    `, [yr, mo, ...propParams]);

    const [occupancy] = await pool.query(`
      SELECT p.id,
        COUNT(u.id) AS total_units,
        COUNT(CASE WHEN u.status='occupied' THEN 1 END) AS occupied_units
      FROM properties p LEFT JOIN units u ON u.property_id=p.id
      WHERE 1=1${propFilter}
      GROUP BY p.id
    `, propParams);

    const [maintenance] = await pool.query(`
      SELECT p.id, COUNT(m.id) AS open_maintenance
      FROM properties p LEFT JOIN maintenance_requests m ON m.property_id=p.id
        AND m.status NOT IN ('completed','closed','cancelled')
      WHERE 1=1${propFilter}
      GROUP BY p.id
    `, propParams);

    const expenseMap     = Object.fromEntries(expenses.map(e => [e.id, e.total_expenses]));
    const occupancyMap   = Object.fromEntries(occupancy.map(o => [o.id, o]));
    const maintenanceMap = Object.fromEntries(maintenance.map(m => [m.id, m.open_maintenance]));

    const properties = billed.map(p => {
      const totalExpenses = parseFloat(expenseMap[p.id] || 0);
      const collected     = parseFloat(p.collected);
      const grossBilled   = parseFloat(p.gross_billed);
      const occ           = occupancyMap[p.id] || { total_units: 0, occupied_units: 0 };
      const collectionRate = grossBilled > 0 ? Math.round((collected / grossBilled) * 100) : null;
      const occupancyRate  = occ.total_units > 0 ? Math.round((occ.occupied_units / occ.total_units) * 100) : null;
      const noi = collected - totalExpenses;

      // Flag properties worth a closer look — thresholds are a starting
      // point, not a tuned model: below-70%-collected or below-80%-occupied.
      const flags = [];
      if (collectionRate !== null && collectionRate < 70) flags.push('low_collection');
      if (occupancyRate  !== null && occupancyRate  < 80) flags.push('low_occupancy');
      if ((maintenanceMap[p.id] || 0) >= 5) flags.push('high_maintenance_load');

      return {
        id: p.id, name: p.name,
        gross_billed: grossBilled, collected, collection_rate: collectionRate,
        total_expenses: totalExpenses, noi,
        total_units: occ.total_units, occupied_units: occ.occupied_units, occupancy_rate: occupancyRate,
        open_maintenance: maintenanceMap[p.id] || 0,
        flags,
      };
    }).sort((a, b) => b.noi - a.noi);

    const totals = properties.reduce((acc, p) => ({
      gross_billed:     acc.gross_billed + p.gross_billed,
      collected:        acc.collected + p.collected,
      total_expenses:   acc.total_expenses + p.total_expenses,
      noi:              acc.noi + p.noi,
      total_units:      acc.total_units + p.total_units,
      occupied_units:   acc.occupied_units + p.occupied_units,
      open_maintenance: acc.open_maintenance + p.open_maintenance,
    }), { gross_billed:0, collected:0, total_expenses:0, noi:0, total_units:0, occupied_units:0, open_maintenance:0 });

    ok(res, {
      month_year,
      properties,
      totals: {
        ...totals,
        collection_rate: totals.gross_billed > 0 ? Math.round((totals.collected / totals.gross_billed) * 100) : null,
        occupancy_rate:  totals.total_units  > 0 ? Math.round((totals.occupied_units / totals.total_units) * 100) : null,
      },
      top_performer:    properties[0]      || null,
      needs_attention:  properties.filter(p => p.flags.length > 0),
    });
  } catch(e) { safeErr(res, e); }
};

// ── Revenue Trend — portfolio-wide, multiple months ─────────────
// New: pnl() only ever looks at one month_year at a time — there was no
// way to see whether the portfolio is trending up or down over time.
const revenueTrend = async (req, res) => {
  try {
    const months = Math.min(parseInt(req.query.months) || 6, 24);
    const { filter: propFilter, params: propParams } = getScope(req);

    const [billedRows] = await pool.query(`
      SELECT DATE_FORMAT(i.created_at,'%Y-%m') AS period,
        COALESCE(SUM(i.amount),0) AS gross_billed,
        COALESCE(SUM(CASE WHEN i.status='paid' THEN i.amount ELSE i.amount-i.balance END),0) AS collected
      FROM invoices i
      JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN units u ON ten.unit_id=u.id
      JOIN properties p ON u.property_id=p.id
      WHERE i.created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)${propFilter}
      GROUP BY period ORDER BY period
    `, [months, ...propParams]);

    const [expenseRows] = await pool.query(`
      SELECT DATE_FORMAT(e.expense_date,'%Y-%m') AS period,
        COALESCE(SUM(e.amount),0) AS total_expenses
      FROM expenses e JOIN properties p ON e.property_id=p.id
      WHERE e.expense_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)${propFilter}
      GROUP BY period ORDER BY period
    `, [months, ...propParams]);

    const expenseMap = Object.fromEntries(expenseRows.map(e => [e.period, parseFloat(e.total_expenses)]));

    // Build a full month-by-month series even for months with zero
    // activity, rather than only the months that happen to have rows —
    // a gap in a trend chart reads as a data bug, not "nothing happened".
    const trend = [];
    const cursor = new Date();
    cursor.setDate(1);
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(cursor); d.setMonth(d.getMonth() - i);
      const period = d.toISOString().slice(0, 7);
      const row = billedRows.find(b => b.period === period);
      const billed    = row ? parseFloat(row.gross_billed) : 0;
      const collected = row ? parseFloat(row.collected)    : 0;
      const expenses  = expenseMap[period] || 0;
      trend.push({
        period,
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        gross_billed: billed, collected, total_expenses: expenses,
        noi: collected - expenses,
        collection_rate: billed > 0 ? Math.round((collected / billed) * 100) : null,
      });
    }

    ok(res, { trend });
  } catch(e) { safeErr(res, e); }
};
const waiveLateFee = async (req, res) => {
  try {
    // SECURITY FIX: this only ever checked p.org_id=? — a property_manager
    // could waive a penalty invoice on ANY property in their organisation,
    // not just the ones they actually manage. Every other function in this
    // file already uses getScope() for exactly this; this one just wasn't
    // using it.
    const { filter: propFilter, params: propParams } = getScope(req, 'p');
    const [[inv]] = await pool.query(
      `SELECT i.* FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id
       JOIN units u ON ten.unit_id=u.id JOIN properties p ON u.property_id=p.id
       WHERE i.id=? AND i.type='penalty'${propFilter}`, [req.params.id, ...propParams]
    );
    if (!inv) return err(res, 'Penalty invoice not found', 404);

    await pool.query(
      "UPDATE invoices SET status='cancelled', notes=CONCAT(IFNULL(notes,''), ' | Waived by admin on ', CURDATE()) WHERE id=?",
      [inv.id]
    );

    ok(res, { message: 'Late fee waived' });
  } catch(e) { safeErr(res, e); }
};

// ── Export all functions ──────────────────────────────────────
module.exports = {
  pnl,
  cashflowForecast,
  maintenanceKpis,
  occupancyTrend,
  waiveLateFee,
  portfolioOverview,
  revenueTrend,
};