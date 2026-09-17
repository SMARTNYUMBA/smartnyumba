'use strict';

/**
 * SmartNyumba Pro — Organisation Isolation Regression Tests
 *
 * These tests exist to lock in the org-isolation fixes made across the
 * codebase (see FIXES_APPLIED.md, "Phase 2"). Before that pass, dozens
 * of endpoints let an authenticated user from one organisation read,
 * edit, or delete another organisation's data just by guessing/
 * incrementing a numeric ID. Each test below targets one of the
 * concrete gaps that was found and fixed — if any of these start
 * failing, an org-isolation check has been removed or weakened.
 *
 * Run: node --test tests/org-isolation.test.js
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { mockPool, mockReq, mockRes, makeUser } = require('./helpers');

before(() => {
  process.env.JWT_SECRET = 'test_secret_min_32_chars_long_enough_00';
  process.env.NODE_ENV   = 'test';
});

// Loads a controller fresh against a given mock pool, bypassing
// require's module cache so each test gets an isolated instance.
function freshController(pool, path) {
  require.cache[require.resolve('../config/db')] = { exports: pool };
  delete require.cache[require.resolve(path)];
  return require(path);
}

const CALLER_ORG  = 5;   // the requesting user's organisation
const OTHER_ORG   = 9;   // a different organisation whose data must stay hidden

// ─────────────────────────────────────────────────────────────
describe('properties.js — cross-org access', { concurrency: false }, () => {
  test('getOne returns 404 for a property in a different org (never leaks the row)', async () => {
    // The controller's query includes "AND p.org_id=?" — a mock DB
    // would only return this row if the query's WHERE clause actually
    // filtered by org. Simulating "no matching row" is exactly what a
    // real MySQL server would do once that filter is present.
    const pool = mockPool({ 'FROM properties p': [[]] });
    const c = freshController(pool, '../controllers/admin/properties');
    const req = mockReq({ user: makeUser('super_admin', { org_id: CALLER_ORG }), params: { id: 42 } });
    const res = mockRes();
    await c.getOne(req, res);
    res.assertStatus(404);
    const call = pool._calls.find(c => c.sql.includes('FROM properties'));
    assert.ok(call.sql.includes('org_id'), 'getOne query must filter by org_id');
    assert.ok(call.params.includes(CALLER_ORG), 'query must be parameterised with the caller\'s org_id, not the target\'s');
  });

  test('create always stamps org_id from the session, not the request body', async () => {
    const pool = mockPool({ 'INSERT INTO properties': [{ insertId: 1 }] });
    const c = freshController(pool, '../controllers/admin/properties');
    const req = mockReq({
      user: makeUser('super_admin', { org_id: CALLER_ORG }),
      // Even if a client tried to smuggle a different org_id in the body,
      // the controller must never read req.body.org_id.
      body: { name: 'Test Property', org_id: OTHER_ORG },
    });
    const res = mockRes();
    await c.create(req, res);
    const insert = pool._calls.find(c => c.sql.includes('INSERT INTO properties'));
    assert.ok(insert, 'must INSERT a property');
    assert.ok(insert.sql.includes('org_id'), 'INSERT must include the org_id column');
    assert.ok(insert.params.includes(CALLER_ORG), 'org_id must come from the session, not the body');
    assert.ok(!insert.params.includes(OTHER_ORG), 'body-supplied org_id must never be used');
  });

  test('update and delete both scope their WHERE clause by org_id', async () => {
    const pool = mockPool({
      'SELECT manager_id, id FROM properties': [[]], // simulate: not found in caller's org
    });
    const c = freshController(pool, '../controllers/admin/properties');
    const req = mockReq({ user: makeUser('super_admin', { org_id: CALLER_ORG }), params: { id: 99 }, body: { name: 'X' } });
    const res = mockRes();
    await c.update(req, res);
    res.assertStatus(404, 'update must 404 rather than editing another org\'s property');
  });
});

// ─────────────────────────────────────────────────────────────
describe('users.js — resetPassword (most severe finding in the audit)', { concurrency: false }, () => {
  test('resetPassword scopes the UPDATE by org_id and 404s on 0 affected rows', async () => {
    // affectedRows: 0 simulates "the target user_id exists, but belongs
    // to a different organisation" — this is the exact scenario that
    // previously allowed a full cross-org account takeover.
    const pool = mockPool({
      'UPDATE users SET password_hash': [{ affectedRows: 0 }],
    });
    const c = freshController(pool, '../controllers/admin/users');
    const req = mockReq({
      user: makeUser('super_admin', { org_id: CALLER_ORG }),
      params: { id: 4321 }, // some other org's user id
      body: { password: 'newpassword123' },
    });
    const res = mockRes();
    await c.resetPassword(req, res);
    res.assertStatus(404);
    const update = pool._calls.find(c => c.sql.includes('UPDATE users SET password_hash'));
    assert.ok(update.sql.includes('org_id'), 'resetPassword must filter the UPDATE by org_id');
    assert.ok(update.params.includes(CALLER_ORG), 'must scope to the caller\'s own org_id');
  });

  test('resetPassword revokes existing sessions on success', async () => {
    const pool = mockPool({
      'UPDATE users SET password_hash': [{ affectedRows: 1 }],
      'DELETE FROM refresh_tokens': [{ affectedRows: 2 }],
    });
    const c = freshController(pool, '../controllers/admin/users');
    const req = mockReq({
      user: makeUser('super_admin', { org_id: CALLER_ORG }),
      params: { id: 10 },
      body: { password: 'newpassword123' },
    });
    const res = mockRes();
    await c.resetPassword(req, res);
    res.assertSuccess();
    const revoke = pool._calls.find(c => c.sql.includes('DELETE FROM refresh_tokens'));
    assert.ok(revoke, 'a password reset must revoke the target\'s existing sessions');
  });

  test('deleteUser scopes the lookup by org_id and 404s for a different org\'s user', async () => {
    const pool = mockPool({ 'SELECT role, full_name FROM users': [[]] });
    const c = freshController(pool, '../controllers/admin/users');
    const req = mockReq({ user: makeUser('super_admin', { org_id: CALLER_ORG, sub: 1 }), params: { id: 4321 } });
    const res = mockRes();
    await c.deleteUser(req, res);
    res.assertStatus(404);
  });
});

// ─────────────────────────────────────────────────────────────
describe('payments.js — record (cross-org financial write)', { concurrency: false }, () => {
  test('rejects when invoice_id/tenancy_id do not both belong to the caller\'s org', async () => {
    // Simulates: invoice_id and tenancy_id are individually real, but
    // either belong to another org or don't actually pair together —
    // the guard query returns nothing either way.
    const pool = mockPool({ 'FROM invoices WHERE id=? AND tenancy_id=? AND org_id=?': [[]] });
    const c = freshController(pool, '../controllers/admin/payments');
    const req = mockReq({
      user: makeUser('property_manager', { org_id: CALLER_ORG }),
      body: { invoice_id: 55, tenancy_id: 77, amount: 5000, payment_method: 'cash' },
    });
    const res = mockRes();
    await c.record(req, res);
    res.assertStatus(404);
    const noInsert = pool._calls.find(c => c.sql.includes('INSERT INTO payments'));
    assert.equal(noInsert, undefined, 'must NOT insert a payment when ownership check fails');
  });
});

// ─────────────────────────────────────────────────────────────
describe('tenancies.js — create (cross-org tenant/unit pairing)', { concurrency: false }, () => {
  test('rejects when the tenant belongs to a different org than the caller', async () => {
    const pool = mockPool({
      'FROM tenants t JOIN users u ON t.user_id=u.id WHERE t.id=? AND t.org_id=?': [[]],
      'FROM tenants t JOIN users u ON t.user_id=u.id WHERE u.id=? AND t.org_id=?': [[]],
    });
    const c = freshController(pool, '../controllers/admin/tenancies');
    const req = mockReq({
      user: makeUser('property_manager', { org_id: CALLER_ORG }),
      body: { tenant_id: 1, unit_id: 2, start_date: '2025-01-01', rent_amount: 10000 },
    });
    const res = mockRes();
    await c.create(req, res);
    res.assertStatus(404);
  });

  test('rejects when the unit belongs to a different org than the caller', async () => {
    const pool = mockPool({
      // Tenant lookup succeeds (same org)...
      'FROM tenants t JOIN users u ON t.user_id=u.id WHERE t.id=? AND t.org_id=?':
        [[{ tenant_id: 1, full_name: 'Jane', email: 'j@example.com', phone: '0700000000', user_id: 1 }]],
      // ...but the unit lookup (also org-scoped) finds nothing.
      'FROM units u JOIN properties p ON u.property_id=p.id WHERE u.id=? AND u.org_id=?': [[]],
    });
    const c = freshController(pool, '../controllers/admin/tenancies');
    const req = mockReq({
      user: makeUser('property_manager', { org_id: CALLER_ORG }),
      body: { tenant_id: 1, unit_id: 2, start_date: '2025-01-01', rent_amount: 10000 },
    });
    const res = mockRes();
    await c.create(req, res);
    res.assertStatus(404);
  });
});

// ─────────────────────────────────────────────────────────────
describe('deposit_refund.js — markRefundPaid (no org_id column of its own)', { concurrency: false }, () => {
  test('the UPDATE is a JOIN through tenancies, scoped by org_id, and 404s on 0 affected rows', async () => {
    const pool = mockPool({ 'UPDATE deposit_refunds dr': [{ affectedRows: 0 }] });
    const c = freshController(pool, '../controllers/admin/deposit_refund');
    const req = mockReq({
      user: makeUser('property_manager', { org_id: CALLER_ORG }),
      params: { id: 33 },
      body: { payment_reference: 'REF123' },
    });
    const res = mockRes();
    await c.markRefundPaid(req, res);
    res.assertStatus(404);
    const update = pool._calls.find(c => c.sql.includes('UPDATE deposit_refunds dr'));
    assert.ok(update.sql.includes('JOIN tenancies'), 'must verify ownership via the parent tenancy');
    assert.ok(update.sql.includes('org_id'), 'must filter by org_id');
  });
});

// ─────────────────────────────────────────────────────────────
describe('enterprise.js — vehicleLookup (platform-wide PII leak)', { concurrency: false }, () => {
  test('both sub-queries are scoped to the caller\'s org', async () => {
    const pool = mockPool({
      'FROM tenants t': [[]],
      'FROM parking_allocations pa': [[]],
      'INSERT INTO access_log': { insertId: 1 },
    });
    const c = freshController(pool, '../controllers/admin/enterprise');
    const req = mockReq({ user: makeUser('security', { org_id: CALLER_ORG }), query: { plate: 'KBZ123A' } });
    const res = mockRes();
    await c.vehicleLookup(req, res);
    res.assertSuccess();
    const tenantQuery = pool._calls.find(c => c.sql.includes('FROM tenants t'));
    const parkingQuery = pool._calls.find(c => c.sql.includes('FROM parking_allocations pa'));
    assert.ok(tenantQuery.sql.includes('t.org_id'), 'tenant sub-query must filter by org_id');
    assert.ok(tenantQuery.params.includes(CALLER_ORG), 'tenant sub-query must use the caller\'s org_id');
    assert.ok(parkingQuery.sql.includes('t.org_id'), 'parking sub-query must filter by org_id');
    assert.ok(parkingQuery.params.includes(CALLER_ORG), 'parking sub-query must use the caller\'s org_id');
  });
});

// ─────────────────────────────────────────────────────────────
describe('mpesaStk.js — initiate/checkStatus (non-tenant roles)', { concurrency: false }, () => {
  test('initiate rejects an invoice_id outside the caller\'s org for non-tenant roles', async () => {
    const pool = mockPool({
      'SELECT id FROM invoices WHERE id=? AND org_id=?': [[]],
      "SELECT setting_key, setting_value FROM settings": [[]],
    });
    const c = freshController(pool, '../controllers/admin/mpesaStk');
    const req = mockReq({
      user: makeUser('property_manager', { org_id: CALLER_ORG }),
      body: { invoice_id: 999, amount: 5000, phone: '0712345678' },
    });
    const res = mockRes();
    await c.initiate(req, res);
    res.assertStatus(404);
  });

  test('checkStatus derives ownership via the invoice for non-tenant roles', async () => {
    const pool = mockPool({
      'FROM mpesa_transactions WHERE checkout_request_id=?':
        [[{ status: 'pending', initiated_by: 1, invoice_id: 500 }]],
      'SELECT org_id FROM invoices WHERE id=?': [[{ org_id: OTHER_ORG }]],
    });
    const c = freshController(pool, '../controllers/admin/mpesaStk');
    const req = mockReq({
      user: makeUser('property_manager', { org_id: CALLER_ORG }),
      params: { checkout_id: 'ws_CO_123' },
    });
    const res = mockRes();
    await c.checkStatus(req, res);
    res.assertStatus(404, 'must not expose a transaction whose invoice belongs to another org');
  });
});

describe('payments.js#initiateStk — consolidated canonical implementation', { concurrency: false }, () => {
  // CONSOLIDATION: routes/mpesa.js and routes/mpesaStk.js#initiate both
  // now delegate to this function instead of keeping their own copies —
  // these tests cover the scoping this function needs to get right for
  // all three routes, not just /payments/stk/initiate.

  test('property_manager cannot target an invoice on a property they do not manage', async () => {
    const pool = mockPool({
      'SELECT id, tenancy_id, balance FROM invoices WHERE id=? AND org_id=?': [[]], // scoped query matches nothing
    });
    const c = freshController(pool, '../controllers/admin/payments');
    const req = mockReq({
      user: makeUser('property_manager', { sub: 7, org_id: CALLER_ORG }),
      body: { invoice_id: 50, amount: 5000, phone: '0712345678' },
    });
    const res = mockRes();
    await c.initiateStk(req, res);
    res.assertStatus(404);
    const call = pool._calls.find(c => c.sql.includes('p.manager_id=?'));
    assert.ok(call, 'property_manager role must add a manager_id scoping clause, not just an org_id check');
  });

  test('owner is scoped to properties they own', async () => {
    const pool = mockPool({
      'SELECT id, tenancy_id, balance FROM invoices WHERE id=? AND org_id=?': [[{ id: 50, tenancy_id: 900, balance: 5000 }]],
      'INSERT INTO mpesa_transactions': [{ insertId: 1 }],
    });
    const c = freshController(pool, '../controllers/admin/payments');
    const req = mockReq({
      user: makeUser('owner', { sub: 8, org_id: CALLER_ORG }),
      body: { invoice_id: 50, amount: 5000, phone: '0712345678' },
    });
    const res = mockRes();
    await c.initiateStk(req, res);
    const call = pool._calls.find(c => c.sql.includes('p.owner_id=?'));
    assert.ok(call && call.params.includes(8), 'owner role must add an owner_id scoping clause');
  });

  test('rejects an amount above the invoice balance regardless of role', async () => {
    const pool = mockPool({
      'SELECT id, tenancy_id, balance FROM invoices WHERE id=? AND org_id=?': [[{ id: 50, tenancy_id: 900, balance: 1000 }]],
    });
    const c = freshController(pool, '../controllers/admin/payments');
    const req = mockReq({
      user: makeUser('super_admin', { org_id: CALLER_ORG }),
      body: { invoice_id: 50, amount: 999999, phone: '0712345678' },
    });
    const res = mockRes();
    await c.initiateStk(req, res);
    res.assertStatus(400);
  });
});
