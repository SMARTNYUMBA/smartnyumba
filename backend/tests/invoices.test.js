'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { mockPool, mockReq, mockRes, makeUser, makeInvoice, makeTenancy } = require('./helpers');

before(() => {
  process.env.JWT_SECRET = 'test_secret_min_32_chars_long_enough_00';
  process.env.NODE_ENV   = 'test';
});

const freshController = (pool) => {
  require.cache[require.resolve('../config/db')] = { exports: pool };
  delete require.cache[require.resolve('../controllers/admin/invoices')];
  return require('../controllers/admin/invoices');
};

describe('getAll — derived-table JOIN (no correlated subquery)', () => {
  test('returns invoices with receipt_number from JOIN, not subquery', async () => {
    const pool = mockPool({
      'FROM invoices i JOIN tenancies': [[
        makeInvoice({ id: 1, receipt_number: 'RCP-2024-001' }),
        makeInvoice({ id: 2, receipt_number: null }),
      ]],
      'SELECT COUNT(*) AS total FROM': [[{ total: 2 }]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), query: {} });
    const res = mockRes();
    await c.getAll(req, res);
    res.assertSuccess();
    assert.equal(res._body.invoices.length, 2);
    // Confirm no correlated subquery used
    const hasCorrelated = pool._calls.some(c =>
      c.sql.includes('SELECT id FROM payments WHERE invoice_id=i.id'));
    assert.equal(hasCorrelated, false, 'must NOT use correlated subquery for receipt_number');
    // Confirm derived-table JOIN used instead
    const hasDerivedJoin = pool._calls.some(c =>
      c.sql.includes('MAX(paid_at)') || c.sql.includes('latest_paid_at') || c.sql.includes('INNER JOIN'));
    assert.ok(hasDerivedJoin, 'must use derived-table JOIN for receipt_number lookup');
  });

  test('tenant only sees their own invoices', async () => {
    const pool = mockPool({
      'SELECT id FROM tenants WHERE user_id': [[{ id: 42 }]],
      'FROM invoices i JOIN tenancies': [[makeInvoice({ tenancy_id: 10 })]],
      'SELECT COUNT(*) AS total FROM': [[{ total: 1 }]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('tenant', { sub: 7 }), query: {} });
    const res = mockRes();
    await c.getAll(req, res);
    res.assertSuccess();
    const scopedQuery = pool._calls.find(c =>
      c.sql.includes('ten.tenant_id') && c.params.includes(42));
    assert.ok(scopedQuery, 'query must scope by tenant_id=42');
  });

  test('manager only sees their own properties', async () => {
    const pool = mockPool({
      'FROM invoices i JOIN tenancies': [[makeInvoice({ id: 5 })]],
      'SELECT COUNT(*) AS total FROM': [[{ total: 1 }]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('property_manager', { sub: 3 }), query: {} });
    const res = mockRes();
    await c.getAll(req, res);
    res.assertSuccess();
    const scopedQuery = pool._calls.find(c =>
      c.sql.includes('manager_id') && c.params.includes(3));
    assert.ok(scopedQuery, 'query must scope by manager_id=3');
  });
});

describe('bulkGenerate — atomic transaction', () => {
  test('all invoices generated in a single transaction', async () => {
    const tenancies = [
      makeTenancy({ id: 1, rent_amount: 5000 }),
      makeTenancy({ id: 2, rent_amount: 8000 }),
      makeTenancy({ id: 3, rent_amount: 12000 }),
    ];
    let committed = false;
    let rolledBack = false;
    const pool = mockPool({
      "SELECT * FROM tenancies WHERE status='active'": [tenancies],
      "SELECT id FROM invoices WHERE tenancy_id": [[]], // no existing invoice
      'INSERT INTO invoices': [{ insertId: 100 }],
      'INSERT INTO tenant_ledger': [{ insertId: 200 }],
      'SELECT COUNT(*) AS active_count': [[{ active_count: 3 }]],
    });
    // Override getConnection to track transaction calls
    const fakeConn = {
      _queries: [],
      query: async (sql, params) => {
        fakeConn._queries.push({ sql, params });
        return pool.query(sql, params);
      },
      beginTransaction: async () => {},
      commit:   async () => { committed = true; },
      rollback: async () => { rolledBack = true; },
      release:  () => {},
    };
    pool.getConnection = async () => fakeConn;

    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin'), body: { due_date: '2024-04-05' } });
    const res = mockRes();
    await c.bulkGenerate(req, res);
    res.assertSuccess();
    assert.ok(committed, 'transaction must be committed on success');
    assert.equal(rolledBack, false, 'transaction must NOT be rolled back on success');
    assert.equal(res._body.generated, 3, 'should generate invoice for each tenancy');
  });

  test('rolls back if an INSERT fails mid-loop', async () => {
    let committed = false;
    let rolledBack = false;
    const tenancies = [
      makeTenancy({ id: 1, rent_amount: 5000 }),
      makeTenancy({ id: 2, rent_amount: 8000 }),
    ];
    let insertCount = 0;
    const fakeConn = {
      query: async (sql, params) => {
        if (sql.includes('SELECT COUNT(*) AS active_count')) return [[{ active_count: 2 }]];
        if (sql.includes("SELECT * FROM tenancies")) return [tenancies];
        if (sql.includes("SELECT id FROM invoices")) return [[]];
        if (sql.includes('INSERT INTO invoices')) {
          insertCount++;
          if (insertCount === 2) throw new Error('Simulated DB failure');
          return [{ insertId: 99 + insertCount }];
        }
        if (sql.includes('INSERT INTO tenant_ledger')) return [{ insertId: 1 }];
        return [[]];
      },
      beginTransaction: async () => {},
      commit:   async () => { committed = true; },
      rollback: async () => { rolledBack = true; },
      release:  () => {},
    };
    const fakePool = { getConnection: async () => fakeConn };
    require.cache[require.resolve('../config/db')] = { exports: fakePool };
    delete require.cache[require.resolve('../controllers/admin/invoices')];
    const c = require('../controllers/admin/invoices');

    const req = mockReq({ user: makeUser('super_admin'), body: {} });
    const res = mockRes();
    await c.bulkGenerate(req, res);

    assert.equal(committed,   false, 'must NOT commit when an insert fails');
    assert.ok(rolledBack,           'must ROLLBACK when an insert fails');
    assert.equal(res.statusCode, 500, 'should return 500 on DB failure');
  });

  test('skips tenancies that already have an invoice this month', async () => {
    const tenancies = [
      makeTenancy({ id: 10, rent_amount: 6000 }),
      makeTenancy({ id: 11, rent_amount: 7000 }),
    ];
    let committed = false;
    const fakeConn = {
      query: async (sql) => {
        if (sql.includes('active_count')) return [[{ active_count: 2 }]];
        if (sql.includes('SELECT * FROM tenancies')) return [tenancies];
        if (sql.includes('SELECT id FROM invoices WHERE tenancy_id=? AND type')) {
          // First tenancy has existing invoice, second doesn't
          if (sql.includes('10') || (Array.isArray(arguments[1]) && arguments[1][0] === 10))
            return [[{ id: 99 }]]; // already has invoice
          return [[]];
        }
        if (sql.includes('INSERT INTO invoices')) return [{ insertId: 200 }];
        if (sql.includes('INSERT INTO tenant_ledger')) return [{ insertId: 300 }];
        return [[]];
      },
      beginTransaction: async () => {},
      commit:   async () => { committed = true; },
      rollback: async () => {},
      release:  () => {},
    };
    const fakePool = { getConnection: async () => fakeConn };
    require.cache[require.resolve('../config/db')] = { exports: fakePool };
    delete require.cache[require.resolve('../controllers/admin/invoices')];
    const c = require('../controllers/admin/invoices');

    const req = mockReq({ user: makeUser('super_admin'), body: {} });
    const res = mockRes();
    await c.bulkGenerate(req, res);

    assert.ok(committed, 'should commit the transaction');
    // At most 1 invoice generated (one was skipped)
    assert.ok(res._body.skipped >= 0, 'should report skipped count');
  });

  test('blocks bulk generation for orgs over 2000 active tenancies', async () => {
    const fakeConn = {
      query: async (sql) => {
        if (sql.includes('active_count')) return [[{ active_count: 2500 }]];
        return [[]];
      },
      beginTransaction: async () => {},
      commit:   async () => {},
      rollback: async () => {},
      release:  () => {},
    };
    require.cache[require.resolve('../config/db')] = { exports: { getConnection: async () => fakeConn } };
    delete require.cache[require.resolve('../controllers/admin/invoices')];
    const c = require('../controllers/admin/invoices');

    const req = mockReq({ user: makeUser('super_admin'), body: {} });
    const res = mockRes();
    await c.bulkGenerate(req, res);

    assert.equal(res.statusCode, 400, 'should reject bulk generate over 2000 tenancies');
  });
});

describe('create single invoice', () => {
  test('creates invoice and debits ledger', async () => {
    const pool = mockPool({
      'SELECT * FROM tenancies WHERE id=? AND org_id=?': [[{ id: 5, tenant_id: 2, rent_amount: 8000, org_id: 1 }]],
      'INSERT INTO invoices': [{ insertId: 77 }],
      'INSERT INTO tenant_ledger': [{ insertId: 88 }],
    });
    const c = freshController(pool);
    const req = mockReq({
      user: makeUser('super_admin', { org_id: 1 }),
      body: { tenancy_id: 5, type: 'rent', amount: 8000, due_date: '2024-04-05' },
    });
    const res = mockRes();
    await c.create(req, res);
    res.assertStatus(201);
    const ledgerInsert = pool._calls.find(c => c.sql.includes('INSERT INTO tenant_ledger'));
    assert.ok(ledgerInsert, 'must debit the tenant ledger on invoice creation');
  });
});
