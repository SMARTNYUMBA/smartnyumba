'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { mockPool, mockReq, mockRes, makeUser } = require('./helpers');

before(() => {
  process.env.JWT_SECRET = 'test_secret_min_32_chars_long_enough_00';
  process.env.NODE_ENV   = 'test';
});

const freshController = (pool) => {
  require.cache[require.resolve('../config/db')] = { exports: pool };
  delete require.cache[require.resolve('../controllers/admin/reports_enhanced')];
  return require('../controllers/admin/reports_enhanced');
};

// NOTE: this file was rewritten against the actual current
// controllers/admin/reports_enhanced.js — the previous version tested a
// response shape (top-level gross_income/net_income/vacancy_loss,
// maintenanceKpis returning overall+byCategory+topUnits) that doesn't
// match what the controller has actually returned for some time
// (per-property `pnl` array + `totals`, and maintenanceKpis returning
// only `byCategory` — no `overall` or `topUnits` at all). See the note
// at the bottom of the Maintenance KPIs block.

describe('Enhanced P&L report', () => {
  test('returns correct per-property structure with totals, and the flat fields/breakdowns the frontend reads', async () => {
    const pool = mockPool({
      'AS gross_billed':  [[{ id: 1, name: 'Sunset Apts', gross_billed: 500000, collected: 430000, uncollected: 70000 }]],
      "e.category, COALESCE(SUM(e.amount),0) AS total": [[
        { property_id: 1, property_name: 'Sunset Apts', category: 'repairs', total: 120000 },
      ]],
      'AS vacancy_loss': [[{ id: 1, vacancy_loss: 15000 }]],
      "i.type, COALESCE(SUM(i.amount),0) AS amount": [[
        { type: 'rent', amount: 480000 }, { type: 'penalty', amount: 20000 },
      ]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: { month_year: '2024-03' } });
    const res = mockRes();
    await c.pnl(req, res);
    res.assertSuccess();
    const { _body: body } = res;
    assert.equal(body.month_year, '2024-03');
    assert.equal(body.pnl.length, 1);
    const prop = body.pnl[0];
    assert.equal(prop.gross_billed, 500000);
    assert.equal(prop.collected, 430000);
    assert.equal(prop.vacancy_loss, 15000);
    assert.equal(prop.total_expenses, 120000);
    assert.equal(prop.net_operating_income, 430000 - 120000, 'NOI must equal collected - expenses');
    assert.equal(body.totals.net_operating_income, prop.net_operating_income);

    // BUG FIX coverage: these are exactly the fields the frontend's P&L
    // tab reads directly (pnl.gross_income, pnl.total_expenses, etc.) —
    // none of them existed on the response before this fix, so every KPI
    // card and both breakdown panels on that tab silently showed 0/blank.
    assert.equal(body.gross_income, 500000);
    assert.equal(body.total_expenses, 120000);
    assert.equal(body.net_income, 430000 - 120000);
    assert.equal(body.vacancy_loss, 15000, 'totals-level vacancy_loss must be the sum across properties');
    assert.deepEqual(body.expense_breakdown, [{ category: 'repairs', amount: 120000 }]);
    assert.deepEqual(body.income_breakdown, [{ type: 'rent', amount: 480000 }, { type: 'penalty', amount: 20000 }]);
  });

  test('property_manager query is scoped to manager_id', async () => {
    const pool = mockPool({
      'AS gross_billed':  [[]],
      "e.category, COALESCE(SUM(e.amount),0) AS total": [[]],
      'AS vacancy_loss': [[]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('property_manager', { sub: 5, org_id: 1 }), query: { month_year: '2024-03' } });
    const res = mockRes();
    await c.pnl(req, res);
    res.assertSuccess();
    const managerQuery = pool._calls.find(c => c.sql.includes('manager_id=?') && c.params.includes(5));
    assert.ok(managerQuery, 'query should be scoped to manager_id');
  });

  test('collection_rate is derived from gross_billed vs collected', async () => {
    const pool = mockPool({
      'AS gross_billed':  [[{ id: 1, name: 'Prop', gross_billed: 200000, collected: 150000, uncollected: 50000 }]],
      "e.category, COALESCE(SUM(e.amount),0) AS total": [[]],
      'AS vacancy_loss': [[]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: { month_year: '2024-03' } });
    const res = mockRes();
    await c.pnl(req, res);
    res.assertSuccess();
    assert.equal(res._body.pnl[0].collection_rate, 75, '150000/200000 should be 75%');
  });
});

describe('Cashflow forecast', () => {
  test('returns 3-month forecast array', async () => {
    const pool = mockPool({
      'COALESCE(SUM(py.amount),0) AS collected':  [[{ collected: 380000, billed: 450000 }]],
      'COALESCE(SUM(ten.rent_amount),0) AS expected_rent': [[{ expected_rent: 450000 }]],
      'COALESCE(SUM(e.amount),0)/3 AS avg_monthly': [[{ avg_monthly: 80000 }]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: {} });
    const res = mockRes();
    await c.cashflowForecast(req, res);
    res.assertSuccess();
    assert.ok(Array.isArray(res._body.forecast), 'forecast should be an array');
    assert.equal(res._body.forecast.length, 3, 'should return 3 months');
    const m = res._body.forecast[0];
    assert.ok('month'              in m, 'each month should have month label');
    assert.ok('projected_income'   in m, 'each month should have projected_income');
    assert.ok('projected_expenses' in m, 'each month should have projected_expenses');
    assert.ok('net'                in m, 'each month should have net');
    assert.ok('status'             in m, 'each month should have surplus/shortfall status');
  });

  test('collection_rate between 0 and 100', async () => {
    const pool = mockPool({
      'COALESCE(SUM(py.amount),0) AS collected':  [[{ collected: 500000, billed: 541667 }]],
      'COALESCE(SUM(ten.rent_amount),0) AS expected_rent': [[{ expected_rent: 541667 }]],
      'COALESCE(SUM(e.amount),0)/3 AS avg_monthly': [[{ avg_monthly: 90000 }]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('owner', { sub: 9 }), query: {} });
    const res = mockRes();
    await c.cashflowForecast(req, res);
    res.assertSuccess();
    const rate = res._body.collection_rate;
    assert.ok(rate >= 0 && rate <= 100, `collection_rate ${rate} should be between 0 and 100`);
  });

  test('falls back to an 80% assumed collection rate when nothing has been billed yet', async () => {
    const pool = mockPool({
      'COALESCE(SUM(py.amount),0) AS collected':  [[{ collected: 0, billed: 0 }]],
      'COALESCE(SUM(ten.rent_amount),0) AS expected_rent': [[{ expected_rent: 100000 }]],
      'COALESCE(SUM(e.amount),0)/3 AS avg_monthly': [[{ avg_monthly: 0 }]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: {} });
    const res = mockRes();
    await c.cashflowForecast(req, res);
    res.assertSuccess();
    assert.equal(res._body.collection_rate, 80);
  });
});

describe('Maintenance KPIs', () => {
  test('returns byCategory, overall totals, and topUnits', async () => {
    const pool = mockPool({
      // Distinct, non-overlapping substrings — both queries start with
      // "FROM maintenance_requests mr" so a shared key would make one
      // query's mock accidentally satisfy the other too.
      'GROUP BY mr.category': [[
        { category: 'plumbing',   total: 20, avg_hours: 12, open_count: 3, total_cost: 90000 },
        { category: 'electrical', total: 15, avg_hours: 8,  open_count: 1, total_cost: 75000 },
        { category: 'structural', total: 10, avg_hours: 36, open_count: 0, total_cost: 85000 },
      ]],
      'GROUP BY u.id, u.unit_number, p.name': [[
        { unit_number: 'A12', property_name: 'Sunset Apts', request_count: 5, total_cost: 40000 },
        { unit_number: 'B03', property_name: 'Riverside',   request_count: 3, total_cost: 15000 },
      ]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: {} });
    const res = mockRes();
    await c.maintenanceKpis(req, res);
    res.assertSuccess();
    assert.equal(res._body.byCategory.length, 3);
    assert.equal(res._body.byCategory[0].category, 'plumbing');

    // BUG FIX coverage: the frontend's Maintenance tab reads
    // maint.overall.* and maint.topUnits directly — neither existed on
    // this response before, so those KPI cards and the "Top problem
    // units" panel silently showed 0/blank the whole time.
    assert.equal(res._body.overall.total, 45, 'overall.total must sum all categories (20+15+10)');
    assert.equal(res._body.overall.total_cost, 250000, 'overall.total_cost must sum all categories');
    assert.equal(
      res._body.overall.avg_resolution_hours,
      (12*20 + 8*15 + 36*10) / 45,
      'overall avg_resolution_hours must be weighted by request count per category, not a flat average'
    );
    assert.equal(res._body.topUnits.length, 2);
    assert.equal(res._body.topUnits[0].unit_number, 'A12');
    assert.equal(res._body.topUnits[0].request_count, 5);
  });
});

describe('Occupancy trend', () => {
  test('returns a trend row per month with occupancy_rate computed', async () => {
    const pool = mockPool({
      'AS occupied_units': [[
        { month: 'Jan', period: '2024-01', occupied_units: 60 },
        { month: 'Feb', period: '2024-02', occupied_units: 64 },
      ]],
      'COUNT(*) AS total FROM units': [[{ total: 80 }]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: {} });
    const res = mockRes();
    await c.occupancyTrend(req, res);
    res.assertSuccess();
    assert.equal(res._body.trend.length, 2);
    assert.equal(res._body.current_total, 80);
    assert.equal(res._body.trend[0].occupancy_rate, 75, '60/80 should be 75%');
  });

  test('does not divide by zero when there are no units', async () => {
    const pool = mockPool({
      'AS occupied_units': [[{ month: 'Jan', period: '2024-01', occupied_units: 0 }]],
      'COUNT(*) AS total FROM units': [[{ total: 0 }]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: {} });
    const res = mockRes();
    await c.occupancyTrend(req, res);
    res.assertSuccess();
    assert.equal(res._body.trend[0].occupancy_rate, 0);
  });
});

describe('Portfolio overview (BI)', () => {
  test('ranks properties by NOI and flags underperformers', async () => {
    const pool = mockPool({
      'LEFT JOIN units u ON p.id=u.property_id': [[
        { id: 1, name: 'Sunset Apts', gross_billed: 500000, collected: 480000 },
        { id: 2, name: 'Riverside',   gross_billed: 300000, collected: 150000 },
      ]],
      'LEFT JOIN expenses e ON e.property_id=p.id': [[
        { id: 1, total_expenses: 100000 },
        { id: 2, total_expenses: 80000 },
      ]],
      'COUNT(u.id) AS total_units': [[
        { id: 1, total_units: 20, occupied_units: 19 },
        { id: 2, total_units: 10, occupied_units: 5 },
      ]],
      'LEFT JOIN maintenance_requests m': [[
        { id: 1, open_maintenance: 2 },
        { id: 2, open_maintenance: 6 },
      ]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: { month_year: '2026-08' } });
    const res = mockRes();
    await c.portfolioOverview(req, res);
    res.assertSuccess();
    assert.equal(res._body.properties[0].name, 'Sunset Apts', 'higher-NOI property should rank first');
    assert.deepEqual(res._body.needs_attention.map(p => p.name), ['Riverside']);
    assert.deepEqual(res._body.properties[1].flags, ['low_collection', 'low_occupancy', 'high_maintenance_load']);
    assert.equal(res._body.totals.gross_billed, 800000);
  });

  test('property_manager query is scoped to manager_id', async () => {
    const pool = mockPool({
      'LEFT JOIN units u ON p.id=u.property_id': [[]],
      'LEFT JOIN expenses e ON e.property_id=p.id': [[]],
      'COUNT(u.id) AS total_units': [[]],
      'LEFT JOIN maintenance_requests m': [[]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('property_manager', { sub: 5, org_id: 1 }), query: {} });
    const res = mockRes();
    await c.portfolioOverview(req, res);
    res.assertSuccess();
    const scoped = pool._calls.filter(c => c.sql.includes('manager_id=?') && c.params.includes(5));
    assert.equal(scoped.length, 4, 'all four underlying queries should be scoped to manager_id');
  });
});

describe('Revenue trend (BI)', () => {
  test('returns a full month-by-month series, gap-filling months with no data', async () => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const pool = mockPool({
      'JOIN tenancies ten ON i.tenancy_id=ten.id': [[
        { period: thisMonth, gross_billed: 500000, collected: 400000 },
      ]],
      'FROM expenses e JOIN properties p': [[
        { period: thisMonth, total_expenses: 120000 },
      ]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: { months: '3' } });
    const res = mockRes();
    await c.revenueTrend(req, res);
    res.assertSuccess();
    assert.equal(res._body.trend.length, 3);
    const current = res._body.trend[2];
    assert.equal(current.period, thisMonth);
    assert.equal(current.noi, 280000);
    assert.equal(current.collection_rate, 80);
    // Earlier months with no invoices/expenses should be zero, not missing
    assert.equal(res._body.trend[0].gross_billed, 0);
    assert.equal(res._body.trend[0].collection_rate, null);
  });

  test('months param is capped at 24', async () => {
    const pool = mockPool({
      'JOIN tenancies ten ON i.tenancy_id=ten.id': [[]],
      'FROM expenses e JOIN properties p': [[]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: { months: '999' } });
    const res = mockRes();
    await c.revenueTrend(req, res);
    res.assertSuccess();
    assert.equal(res._body.trend.length, 24);
  });
});

describe('Waive late fee', () => {
  test('super_admin can waive any org penalty invoice', async () => {
    const pool = mockPool({
      "i.type='penalty'": [[{ id: 5, type: 'penalty', status: 'overdue' }]],
      'UPDATE invoices': [{ affectedRows: 1 }],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin', { sub: 1, org_id: 1 }), params: { id: '5' }, body: {} });
    const res = mockRes();
    await c.waiveLateFee(req, res);
    res.assertSuccess();
    const update = pool._calls.find(c => c.sql.includes('UPDATE invoices') && c.params.includes(5));
    assert.ok(update, 'should UPDATE the matched invoice');
  });

  test('property_manager cannot waive a fee on a property they do not manage', async () => {
    // SECURITY FIX (see reports_enhanced.js waiveLateFee): the lookup is now
    // scoped by getScope(), which adds `p.manager_id=?` for a
    // property_manager -- so a query for a property they don't manage
    // simply returns no matching row.
    const pool = mockPool({}); // nothing matches -> invoice lookup returns no row
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('property_manager', { sub: 3, org_id: 1 }), params: { id: '99' }, body: {} });
    const res = mockRes();
    await c.waiveLateFee(req, res);
    res.assertStatus(404);
    const managerScoped = pool._calls.find(c => c.sql.includes('manager_id=?') && c.params.includes(3));
    assert.ok(managerScoped, 'lookup should have been scoped to the caller\'s manager_id');
  });
});
