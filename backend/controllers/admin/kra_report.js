'use strict';

/**
 * KRA Tax Report — append these exports to controllers/admin/reports.js
 * and add the route to routes/reports.js
 *
 * Route to add in routes/reports.js:
 *   router.get('/kra', auth(['super_admin','property_manager']), c.kraReport);
 *   router.get('/kra/pdf', auth(['super_admin','property_manager']), c.kraReportPdf);
 */

const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

/**
 * GET /api/reports/kra?year=2024&property_id=
 *
 * Returns annual rental income data formatted for Kenya Revenue Authority
 * P1 form filing. Covers:
 *  - Gross rental income per property
 *  - Allowable expenses (maintenance, management fees)
 *  - Net taxable income
 *  - Withholding tax on management fees (5%)
 */
exports.kraReport = async (req, res) => {
  try {
    const year  = parseInt(req.query.year) || new Date().getFullYear() - 1;
    const org_id = req.user.org_id;

    // Property filter
    const propFilter = req.query.property_id ? ' AND p.id = ?' : '';
    const propParams = req.query.property_id ? [req.user.org_id, req.query.property_id, year, year, year] : [req.user.org_id, year, year, year];

    // Gross rental income per property
    const [incomeRows] = await pool.query(`
      SELECT
        p.id            AS property_id,
        p.name          AS property_name,
        p.address       AS property_address,
        COUNT(DISTINCT u.id)  AS total_units,
        COUNT(DISTINCT CASE WHEN t.status = 'active' THEN t.id END) AS occupied_units,
        COALESCE(SUM(pay.amount), 0)  AS gross_rent_collected,
        COALESCE(SUM(CASE WHEN pay.paid_at IS NOT NULL THEN 0
                     ELSE inv.amount END), 0) AS rent_arrears
      FROM properties p
      LEFT JOIN units u   ON u.property_id = p.id
      LEFT JOIN tenancies t ON t.unit_id = u.id
      LEFT JOIN invoices inv ON inv.tenancy_id = t.id
            AND YEAR(inv.due_date) = ?
      LEFT JOIN payments pay ON pay.invoice_id = inv.id
            AND YEAR(pay.paid_at) = ?
      WHERE p.org_id = ? ${propFilter}
      GROUP BY p.id, p.name, p.address
      ORDER BY p.name
    `, [year, year, org_id, ...(req.query.property_id ? [req.query.property_id] : [])]);

    // Allowable expenses per property (maintenance + vendor invoices)
    const [expenseRows] = await pool.query(`
      SELECT
        p.id AS property_id,
        COALESCE(SUM(CASE WHEN e.category IN ('maintenance','repairs','plumbing','electrical','roofing') THEN e.amount ELSE 0 END), 0) AS maintenance_costs,
        COALESCE(SUM(CASE WHEN e.category = 'management_fee' THEN e.amount ELSE 0 END), 0)  AS management_fees,
        COALESCE(SUM(CASE WHEN e.category NOT IN ('maintenance','repairs','plumbing','electrical','roofing','management_fee') THEN e.amount ELSE 0 END), 0) AS other_expenses,
        COALESCE(SUM(e.amount), 0) AS total_expenses
      FROM properties p
      LEFT JOIN expenses e ON e.property_id = p.id AND YEAR(e.expense_date) = ?
      WHERE p.org_id = ? ${propFilter}
      GROUP BY p.id
    `, [year, org_id, ...(req.query.property_id ? [req.query.property_id] : [])]);

    const expenseMap = new Map(expenseRows.map(r => [r.property_id, r]));

    const properties = incomeRows.map(p => {
      const exp = expenseMap.get(p.property_id) || {};
      const gross          = parseFloat(p.gross_rent_collected);
      const maintenance    = parseFloat(exp.maintenance_costs || 0);
      const mgmt_fees      = parseFloat(exp.management_fees   || 0);
      const other_exp      = parseFloat(exp.other_expenses    || 0);
      const total_expenses = maintenance + mgmt_fees + other_exp;
      const net_income     = gross - total_expenses;

      // WHT on management fees = 5% (Kenyan law for property management)
      const wht_on_management = mgmt_fees * 0.05;

      // Graduated rental income tax (Kenya Finance Act 2023: 7.5% on gross)
      const rental_income_tax = gross * 0.075;

      return {
        property_id:       p.property_id,
        property_name:     p.property_name,
        property_address:  p.property_address,
        total_units:       p.total_units,
        occupied_units:    p.occupied_units,
        occupancy_rate:    p.total_units ? Math.round((p.occupied_units / p.total_units) * 100) : 0,
        gross_rent_collected: gross,
        rent_arrears:      parseFloat(p.rent_arrears),
        expenses: {
          maintenance:     maintenance,
          management_fees: mgmt_fees,
          other:           other_exp,
          total:           total_expenses,
        },
        net_taxable_income:     net_income,
        wht_on_management:      Math.round(wht_on_management),
        estimated_rental_tax:   Math.round(rental_income_tax),  // 7.5% MRI (Monthly Rental Income)
      };
    });

    // Portfolio totals
    const totals = properties.reduce((acc, p) => ({
      gross_rent:          acc.gross_rent         + p.gross_rent_collected,
      total_expenses:      acc.total_expenses      + p.expenses.total,
      net_income:          acc.net_income          + p.net_taxable_income,
      rental_tax:          acc.rental_tax          + p.estimated_rental_tax,
      wht:                 acc.wht                 + p.wht_on_management,
    }), { gross_rent: 0, total_expenses: 0, net_income: 0, rental_tax: 0, wht: 0 });

    ok(res, {
      year,
      generated_at: new Date().toISOString(),
      disclaimer: 'This report is for reference only. Consult a registered tax advisor for official KRA filing.',
      properties,
      totals: {
        gross_rent_collected:  Math.round(totals.gross_rent),
        total_allowable_expenses: Math.round(totals.total_expenses),
        net_taxable_income:    Math.round(totals.net_income),
        estimated_rental_income_tax: Math.round(totals.rental_tax), // 7.5% MRI
        wht_on_management_fees: Math.round(totals.wht),
        total_tax_liability:   Math.round(totals.rental_tax + totals.wht),
      },
    });
  } catch(e) { safeErr(res, e); }
};
