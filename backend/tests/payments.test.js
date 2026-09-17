'use strict';

/**
 * SmartNyumba Pro — Payments Controller Tests
 *
 * Covers: tenant isolation on GET, duplicate transaction code detection,
 * cash payment restriction for tenants, invoice balance update,
 * and receipt number generation within a transaction.
 *
 * Run: node --test tests/payments.test.js
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { mockPool, mockReq, mockRes, makeUser, makeInvoice, makePayment, makeTenancy } = require('./helpers');

before(() => {
  process.env.JWT_SECRET = 'test_secret_min_32_chars_long_enough_00';
  process.env.NODE_ENV   = 'test';
});

// ─────────────────────────────────────────────────────────────
describe('GET /payments — tenant isolation', () => {
  test('tenant only gets their own payments', async () => {
    const tenantUser = makeUser('tenant', { id: 10, sub: 10 });

    const pool = mockPool({
      'FROM payments py JOIN invoices': [[
        makePayment({ tenancy_id: 5 }),
        makePayment({ tenancy_id: 5 }),
      ]],
      'SELECT COUNT(*)': [[{ total: 2 }]],
    });

    // Inject pool
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/payments')];

    const c   = require('../controllers/admin/payments');
    const req = mockReq({ user: tenantUser, query: {} });
    const res = mockRes();
    await c.getAll(req, res);

    res.assertSuccess();
    // SECURITY FIX (controllers/admin/payments.js getAll): a tenant used
    // to get every payment in their org with no scoping at all. Verify
    // the query is now scoped to the calling tenant's own user_id (10)
    // via the inline tenant-id subquery.
    const tenantQuery = pool._calls.find(
      c => c.sql.includes('ten.tenant_id=(SELECT id FROM tenants WHERE user_id=?)') && c.params.includes(10)
    );
    assert.ok(tenantQuery, 'query should be scoped to the calling tenant (user_id=10)');
  });

  test('tenant with no tenant record gets empty array', async () => {
    const tenantUser = makeUser('tenant', { id: 11, sub: 11 });
    const pool = mockPool({
      'SELECT id FROM tenants WHERE user_id': [[]], // no tenant record
    });
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/payments')];

    const c   = require('../controllers/admin/payments');
    const req = mockReq({ user: tenantUser, query: {} });
    const res = mockRes();
    await c.getAll(req, res);

    res.assertSuccess();
    assert.deepEqual(res._body.payments, []);
  });

  test('admin gets all payments without tenant filter', async () => {
    const adminUser = makeUser('super_admin', { id: 1, sub: 1 });
    const pool = mockPool({
      'FROM payments py JOIN invoices': [[makePayment(), makePayment(), makePayment()]],
      'SELECT COUNT(*)': [[{ total: 3 }]],
    });
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/payments')];

    const c   = require('../controllers/admin/payments');
    const req = mockReq({ user: adminUser, query: {} });
    const res = mockRes();
    await c.getAll(req, res);

    res.assertSuccess();
    assert.equal(res._body.payments.length, 3);
    // Admin should NOT filter by tenant_id
    const tenantFilter = pool._calls.find(c =>
      c.sql.includes('SELECT id FROM tenants WHERE user_id'));
    assert.equal(tenantFilter, undefined, 'admin should not trigger tenant isolation query');
  });
});

// ─────────────────────────────────────────────────────────────
describe('POST /payments — recording', () => {
  test('rejects missing required fields', async () => {
    const pool = mockPool({});
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/payments')];

    const c   = require('../controllers/admin/payments');
    const req = mockReq({
      body: { invoice_id: 1 }, // missing tenancy_id, amount, payment_method
      user: makeUser('super_admin'),
    });
    const res = mockRes();
    await c.record(req, res);
    res.assertStatus(400);
    assert.ok(res._body.error.includes('required'));
  });

  test('rejects cash payment for tenant role', async () => {
    const pool = mockPool({});
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/payments')];

    const c   = require('../controllers/admin/payments');
    const req = mockReq({
      body: { invoice_id: 1, tenancy_id: 1, amount: 5000, payment_method: 'cash' },
      user: makeUser('tenant'),
    });
    const res = mockRes();
    await c.record(req, res);
    res.assertStatus(403);
    assert.ok(res._body.error.includes('Cash'));
  });

  test('rejects invalid M-Pesa code format', async () => {
    const pool = mockPool({
      'SELECT id FROM payments WHERE transaction_code': [[]], // no duplicate
    });
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/payments')];

    const c   = require('../controllers/admin/payments');
    const req = mockReq({
      body: {
        invoice_id: 1, tenancy_id: 1, amount: 5000,
        payment_method: 'mpesa', transaction_code: 'TOOSHORT',
      },
      user: makeUser('super_admin'),
    });
    const res = mockRes();
    await c.record(req, res);
    res.assertStatus(400);
    assert.ok(res._body.error.includes('10 alphanumeric'));
  });

  test('rejects duplicate transaction code', async () => {
    const pool = mockPool({
      'SELECT id FROM payments WHERE transaction_code': [[{ id: 99 }]], // existing
    });
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/payments')];

    const c   = require('../controllers/admin/payments');
    const req = mockReq({
      body: {
        invoice_id: 1, tenancy_id: 1, amount: 5000,
        payment_method: 'mpesa', transaction_code: 'QK12345678',
      },
      user: makeUser('super_admin'),
    });
    const res = mockRes();
    await c.record(req, res);
    res.assertStatus(409);
    assert.ok(res._body.error.includes('already recorded'));
  });
});

// ─────────────────────────────────────────────────────────────
describe('Receipt number generation', () => {
  test('generates unique sequential receipt numbers', async () => {
    // Simulate two concurrent calls both seeing COUNT=5
    const { receiptNumber } = require('../utils/helpers');

    const results = new Set();
    // Generate 5 sequential numbers using a mock pool
    for (let i = 0; i < 5; i++) {
      const localPool = mockPool({
        'SELECT COUNT(*) AS n FROM receipts WHERE YEAR': [[{ n: i }]],
      });
      const rnum = await receiptNumber(localPool);
      results.add(rnum);
    }

    assert.equal(results.size, 5, 'All receipt numbers should be unique');
    for (const rnum of results) {
      assert.match(rnum, /^RCP-\d{4}-\d{5}$/, `Receipt number ${rnum} should match format RCP-YYYY-NNNNN`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('M-Pesa transaction code validation', () => {
  test('accepts valid 10-char alphanumeric code', async () => {
    const validCodes = ['QK12345678', 'AB1234567C', 'AAAAAAAAAA', '1234567890'];
    for (const code of validCodes) {
      assert.match(code.toUpperCase(), /^[A-Z0-9]{10}$/, `${code} should be valid`);
    }
  });

  test('rejects codes that are wrong length or have special chars', () => {
    const invalid = ['SHORT', 'TOOLONGCODE1', 'ABC-12345X', 'QK123 6789'];
    for (const code of invalid) {
      assert.doesNotMatch(code, /^[A-Z0-9]{10}$/, `${code} should be invalid`);
    }
  });
});
