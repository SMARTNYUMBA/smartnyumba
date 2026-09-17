// backend/routes/reports.js
const express = require('express');
const router = express.Router();
const auth   = require('../middleware/auth');
const reports         = require('../controllers/admin/reports');
const reportsEnhanced = require('../controllers/admin/reports_enhanced');
const pool            = require('../config/db');

const REPORT_ROLES = ['super_admin','property_manager','owner'];

// ── P&L Statement — enhanced version with vacancy loss, expense breakdown, NOI
router.get('/pnl',               auth(REPORT_ROLES), reportsEnhanced.pnl);

// ── Cashflow Forecast — enhanced: uses 3-month rolling collection rate
router.get('/cashflow-forecast', auth(REPORT_ROLES), reportsEnhanced.cashflowForecast);

// ── Maintenance KPIs — enhanced: by category, avg resolution hours, total cost
router.get('/maintenance-kpis',  auth(REPORT_ROLES), reportsEnhanced.maintenanceKpis);

// ── Occupancy Trend — enhanced: 12-month history with unit totals
router.get('/occupancy-trend',   auth(REPORT_ROLES), reportsEnhanced.occupancyTrend);

// ── Portfolio Overview — cross-property comparison, flags underperformers
router.get('/portfolio-overview', auth(REPORT_ROLES), reportsEnhanced.portfolioOverview);

// ── Revenue Trend — portfolio-wide, multi-month (default 6, max 24)
router.get('/revenue-trend',      auth(REPORT_ROLES), reportsEnhanced.revenueTrend);

// ── Waive Late Fee
router.post('/waive-late-fee/:id', auth(['super_admin','property_manager']), reportsEnhanced.waiveLateFee);

// ── Tenant Statement — GET /api/reports/statement/:tenancy_id
router.get('/statement/:tenancy_id', auth(['tenant','super_admin','property_manager','owner']), async (req, res) => {
  try {
    const { tenancy_id } = req.params;

    // Security: tenants can only see their own statement
    if (req.user.role === 'tenant') {
      const [[check]] = await pool.query(
        'SELECT ten.id FROM tenancies ten JOIN tenants t ON ten.tenant_id=t.id WHERE ten.id=? AND t.user_id=?',
        [tenancy_id, req.user.sub]);
      if (!check) return res.status(403).json({ error: 'Access denied' });
    } else {
      // SECURITY FIX: no org check for manager/owner/admin roles — any of
      // them could pull another organisation's tenant financial ledger
      // just by guessing a tenancy_id.
      const [[check]] = await pool.query('SELECT id FROM tenancies WHERE id=? AND org_id=?', [tenancy_id, req.user.org_id]);
      if (!check) return res.status(404).json({ error: 'Tenancy not found' });
    }

    // Tenancy details
    const [[tenancy]] = await pool.query(`
      SELECT ten.*, u.full_name, u.email, u.phone,
        un.unit_number, pr.name AS property_name, pr.location AS property_address
      FROM tenancies ten
      JOIN tenants t ON ten.tenant_id = t.id
      JOIN users u ON t.user_id = u.id
      JOIN units un ON ten.unit_id = un.id
      JOIN properties pr ON un.property_id = pr.id
      WHERE ten.id = ?`, [tenancy_id]);
    if (!tenancy) return res.status(404).json({ error: 'Tenancy not found' });

    // Ledger (invoices + payments combined)
    const [ledger] = await pool.query(`
      SELECT 'debit' AS type, i.amount, i.created_at,
        CONCAT(UCASE(LEFT(i.type,1)), LOWER(SUBSTRING(i.type,2)),' Invoice #',i.id) AS description
      FROM invoices i WHERE i.tenancy_id = ?
      UNION ALL
      SELECT 'credit' AS type, p.amount, p.paid_at AS created_at,
        CONCAT('Payment ref: ', COALESCE(p.transaction_code,'—')) AS description
      FROM payments p WHERE p.tenancy_id = ?
      ORDER BY created_at ASC`, [tenancy_id, tenancy_id]);

    // Compute running balance
    let running = 0;
    const ledgerWithBalance = ledger.map(row => {
      running += row.type === 'debit' ? Number(row.amount) : -Number(row.amount);
      return { ...row, running_balance: running };
    });

    // Totals
    const total_invoiced = ledger.filter(r => r.type === 'debit').reduce((s,r)=>s+Number(r.amount),0);
    const total_paid     = ledger.filter(r => r.type === 'credit').reduce((s,r)=>s+Number(r.amount),0);
    const balance        = total_invoiced - total_paid;

    res.json({ tenancy, ledger: ledgerWithBalance, total_invoiced, total_paid, balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// GET /reports/rent-roll — all units with tenant, rent, balance, lease dates
router.get('/rent-roll', auth(REPORT_ROLES), async (req, res) => {
  try {
    const { property_id } = req.query;
    const pool = require('../config/db');
    const { ok, err } = require('../utils/helpers');
    let sql = `
      SELECT
        p.id AS property_id, p.name AS property_name,
        u.id AS unit_id, u.unit_number, u.floor, u.type AS unit_type,
        u.rent_amount AS listed_rent, u.status AS unit_status,
        t.id AS tenancy_id,
        tu.full_name AS tenant_name, tu.phone AS tenant_phone, tu.email AS tenant_email,
        ten.rent_amount AS actual_rent,
        ten.start_date, ten.end_date, ten.status AS tenancy_status,
        ten.billing_mode,
        DATEDIFF(ten.end_date, CURDATE()) AS days_to_expiry,
        COALESCE(
          (SELECT SUM(i.balance) FROM invoices i
           WHERE i.tenancy_id=ten.id AND i.status IN ('unpaid','overdue','partial')), 0
        ) AS outstanding_balance,
        COALESCE(
          (SELECT SUM(i.amount) FROM invoices i
           WHERE i.tenancy_id=ten.id AND i.status='paid'
           AND i.created_at >= DATE_FORMAT(NOW(),'%Y-%m-01')), 0
        ) AS paid_this_month,
        (SELECT MAX(py.paid_at) FROM payments py WHERE py.tenancy_id=ten.id) AS last_payment_date
      FROM units u
      JOIN properties p ON u.property_id = p.id
      LEFT JOIN tenancies ten ON ten.unit_id = u.id AND ten.status IN ('active','approved')
      LEFT JOIN tenants t ON ten.tenant_id = t.id
      LEFT JOIN users tu ON t.user_id = tu.id
      WHERE p.org_id = ?`;
    // SECURITY FIX: previously had no baseline org filter — a super_admin
    // (an org-scoped role in this app, per every other report/controller)
    // with no property_id query param would see every unit, tenant name/
    // phone/email, rent amount, and outstanding balance across the ENTIRE
    // PLATFORM, not just their own organisation.
    const params = [req.user.org_id];
    if (property_id) { sql += ' AND p.id=?'; params.push(property_id); }
    if (req.user.role === 'property_manager') { sql += ' AND p.manager_id=?'; params.push(req.user.sub); }
    if (req.user.role === 'owner') { sql += ' AND p.owner_id=?'; params.push(req.user.sub); }
    sql += ' ORDER BY p.name, u.floor, u.unit_number';
    const [rows] = await pool.query(sql, params);
    // BUG FIX: pages/admin/Reports.jsx's whole Rent Roll tab (table rows,
    // CSV export, and summary footer) reads rr.tenancies / r.rent_amount /
    // r.last_payment_date / summary.count / summary.total_monthly_rent —
    // this endpoint returned `rows`/`actual_rent` and a summary shaped
    // completely differently (total_units/total_rent, no count/
    // total_monthly_rent), and never computed last_payment_date at all.
    // The table body and CSV export always rendered zero rows. Reshaping
    // the response to match what the frontend actually reads, rather than
    // rewriting the frontend, since the query logic itself was already
    // correct — just under different names.
    const tenancies = rows.map(r => ({
      ...r,
      rent_amount: r.actual_rent,
    }));
    const summary = {
      total_units:        rows.length,
      count:               rows.filter(r=>r.tenancy_id).length,
      occupied:            rows.filter(r=>r.unit_status==='occupied').length,
      vacant:              rows.filter(r=>r.unit_status==='vacant').length,
      total_rent:          rows.reduce((s,r)=>s+Number(r.actual_rent||0),0),
      total_monthly_rent:  rows.reduce((s,r)=>s+Number(r.actual_rent||0),0),
      outstanding:         rows.reduce((s,r)=>s+Number(r.outstanding_balance||0),0),
      expiring_30:         rows.filter(r=>r.days_to_expiry>=0&&r.days_to_expiry<=30).length,
    };
    return ok(res, { rows, tenancies, summary });
  } catch(e) { return res.status(500).json({ error: e.message }); }
});


// ── Financial summary (used by Reports page financial tab) ──
router.get('/financial', auth(['super_admin','property_manager','owner']), async (req, res) => {
  try {
    const { period, property_id } = req.query;
    const yr = period ? period.slice(0,4) : new Date().getFullYear().toString();
    const mo = period ? period.slice(5,7) : String(new Date().getMonth()+1).padStart(2,'0');

    // ── Scope by role ──────────────────────────────────────────
    // SECURITY FIX: propFilter previously started empty and only gained a
    // clause for specific roles/query params — a super_admin with no
    // property_id would get propFilter='' on every sub-query below,
    // aggregating revenue, expenses, and arrears across the ENTIRE
    // PLATFORM instead of just their own organisation.
    let propFilter = ' AND pr.org_id=?';
    let propParams = [req.user.org_id];

    if (req.user.role === 'property_manager') {
      // Manager: only see properties where they are the assigned manager
      propFilter += ' AND pr.manager_id=?';
      propParams.push(req.user.sub);
    } else if (req.user.role === 'owner') {
      // Owner: only see properties they own
      propFilter += ' AND pr.owner_id=?';
      propParams.push(req.user.sub);
    } else if (['caretaker','security'].includes(req.user.role) && req.user.property_id) {
      propFilter += ' AND pr.id=?';
      propParams.push(req.user.property_id);
    } else if (property_id) {
      // Super admin with optional filter
      propFilter += ' AND pr.id=?';
      propParams.push(property_id);
    }

    // Revenue collected this period
    const [[rev]] = await pool.query(`
      SELECT COALESCE(SUM(py.amount),0) AS collected
      FROM payments py
      JOIN tenancies ten ON py.tenancy_id=ten.id
      JOIN units u ON ten.unit_id=u.id
      JOIN properties pr ON u.property_id=pr.id
      WHERE YEAR(py.paid_at)=? AND MONTH(py.paid_at)=?${propFilter}`,
      [yr, mo, ...propParams]);

    // Invoices billed this period
    const [[billed]] = await pool.query(`
      SELECT COALESCE(SUM(i.amount),0) AS total_billed,
             COALESCE(SUM(CASE WHEN i.status IN('unpaid','overdue','partial') THEN i.balance ELSE 0 END),0) AS outstanding
      FROM invoices i
      JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN units u ON ten.unit_id=u.id
      JOIN properties pr ON u.property_id=pr.id
      WHERE YEAR(i.created_at)=? AND MONTH(i.created_at)=?${propFilter}`,
      [yr, mo, ...propParams]);

    // Expenses this period
    const [[exp]] = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total_expenses
      FROM expenses e
      JOIN properties pr ON e.property_id=pr.id
      WHERE YEAR(e.expense_date)=? AND MONTH(e.expense_date)=?${propFilter ? propFilter.replace('pr.id=','pr.id=') : ''}`,
      [yr, mo, ...propParams]);

    // Revenue trend last 6 months
    const [trend] = await pool.query(`
      SELECT DATE_FORMAT(py.paid_at,'%b %Y') AS month,
             DATE_FORMAT(py.paid_at,'%Y-%m') AS period,
             COALESCE(SUM(py.amount),0) AS revenue
      FROM payments py
      JOIN tenancies ten ON py.tenancy_id=ten.id
      JOIN units u ON ten.unit_id=u.id
      JOIN properties pr ON u.property_id=pr.id
      WHERE py.paid_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)${propFilter}
      GROUP BY period, month ORDER BY period`,
      propParams);

    // Arrears (top overdue tenants)
    const [arrears] = await pool.query(`
      SELECT u2.full_name AS tenant_name, u2.phone,
             un.unit_number, pr.name AS property_name,
             SUM(i.balance) AS total_owed,
             COALESCE(SUM(CASE WHEN DATEDIFF(CURDATE(),i.due_date) BETWEEN 1 AND 30 THEN i.balance ELSE 0 END),0) AS bucket_30,
             COALESCE(SUM(CASE WHEN DATEDIFF(CURDATE(),i.due_date) BETWEEN 31 AND 60 THEN i.balance ELSE 0 END),0) AS bucket_60,
             COALESCE(SUM(CASE WHEN DATEDIFF(CURDATE(),i.due_date) BETWEEN 61 AND 90 THEN i.balance ELSE 0 END),0) AS bucket_90,
             COALESCE(SUM(CASE WHEN DATEDIFF(CURDATE(),i.due_date) > 90 THEN i.balance ELSE 0 END),0) AS bucket_over90
      FROM invoices i
      JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN tenants t ON ten.tenant_id=t.id
      JOIN users u2 ON t.user_id=u2.id
      JOIN units un ON ten.unit_id=un.id
      JOIN properties pr ON un.property_id=pr.id
      WHERE i.status IN('unpaid','overdue','partial') AND i.balance > 0${propFilter}
      GROUP BY ten.id ORDER BY total_owed DESC LIMIT 20`,
      propParams);

    res.json({
      collected:       Number(rev.collected),
      total_billed:    Number(billed.total_billed),
      outstanding:     Number(billed.outstanding),
      total_expenses:  Number(exp.total_expenses),
      net:             Number(rev.collected) - Number(exp.total_expenses),
      trend,
      arrears,
      period: `${yr}-${mo}`,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── KRA annual tax report ─────────────────────────────────────
const kraCtrl = require('../controllers/admin/kra_report');
router.get('/kra', auth(['super_admin', 'property_manager']), kraCtrl.kraReport);

module.exports = router;
