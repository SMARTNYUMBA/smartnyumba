'use strict';

/**
 * SmartNyumba Pro -- M-Pesa Service Tests
 *
 * Covers: STK push demo-mode fallback, demo-mode auto-confirm on poll,
 * callback processing (success/failure/idempotency), and IP allowlisting.
 *
 * NOTE: this file was rewritten against the app's actual current M-Pesa
 * architecture, which turned out to have THREE separate STK-initiation
 * surfaces (routes/mpesa.js -> services/mpesa.js#stkPush,
 * routes/mpesaStk.js -> controllers/admin/mpesaStk.js#initiate, and
 * routes/payments.js -> controllers/admin/payments.js#initiateStk), but
 * only ONE shared callback/status handler (controllers/admin/mpesaStk.js
 * #callback / #checkStatus, reused by both routes/mpesa.js and
 * routes/mpesaStk.js) plus a SEPARATE demo-mode polling implementation
 * in controllers/admin/payments.js#checkStk. services/mpesa.js#handleCallback
 * exists but is never called from anywhere -- dead code, not tested here.
 * The previous version of this file called functions
 * (`mpesa.checkStk`, `c.mpesaCallback`) that don't exist anywhere in the
 * codebase, so none of it was actually exercising real code.
 *
 * Run: node --test tests/mpesa.test.js
 */

const { test, describe, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockPool, mockReq, mockRes, makeUser } = require('./helpers');

before(() => {
  process.env.JWT_SECRET      = 'test_secret_min_32_chars_long_enough_00';
  process.env.NODE_ENV        = 'test';
  process.env.MPESA_ENV       = 'sandbox';
  process.env.MPESA_SHORTCODE = '174379';
  process.env.MPESA_PASSKEY   = 'test_passkey';
});

afterEach(() => {
  const mods = ['../services/mpesa', '../controllers/admin/payments', '../controllers/admin/mpesaStk'];
  mods.forEach(m => { try { delete require.cache[require.resolve(m)]; } catch {} });
});

// -- Demo mode: STK push -----------------------------------------
describe('M-Pesa demo mode -- stkPush', () => {
  test('stkPush returns a DEMO checkout ID when credentials/settings are not configured', async () => {
    process.env.MPESA_CONSUMER_KEY    = '';
    process.env.MPESA_CONSUMER_SECRET = '';
    process.env.MPESA_ENABLED = '0';

    const pool = mockPool({
      "SELECT setting_value FROM settings": [[]], // not enabled via settings either
      'INSERT INTO mpesa_transactions': [{ insertId: 1 }],
    });
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../services/mpesa')];
    const mpesa = require('../services/mpesa');

    const result = await mpesa.stkPush({
      phone: '0712345678', amount: 5000, invoice_id: 1, tenancy_id: 1, account_ref: 'TEST-001',
    });

    assert.equal(result.success, true);
    assert.ok(result.checkout_request_id?.startsWith('DEMO'), 'Demo mode should return a DEMO* checkout ID');
    assert.ok(result.demo === true, 'Demo flag should be set');
  });

  test('stkPush is enabled via a DB setting even without the env flag', async () => {
    process.env.MPESA_CONSUMER_KEY    = '';
    process.env.MPESA_CONSUMER_SECRET = '';
    process.env.MPESA_ENABLED = '0';

    const pool = mockPool({
      "SELECT setting_value FROM settings": [[{ setting_value: '1' }]],
      'INSERT INTO mpesa_transactions': [{ insertId: 1 }],
    });
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../services/mpesa')];
    const mpesa = require('../services/mpesa');

    // Still demo mode -- enabling M-Pesa doesn't matter if real Daraja
    // credentials are absent (MPESA_CONSUMER_KEY/SECRET here are blank).
    const result = await mpesa.stkPush({ phone: '0712345678', amount: 1000, invoice_id: 1, tenancy_id: 1, account_ref: 'T1' });
    assert.equal(result.demo, true, 'still demo mode without real Daraja credentials');
  });
});

// -- Demo mode: polling / auto-confirm (controllers/admin/payments.js#checkStk) --
describe('M-Pesa demo mode -- checkStk polling', () => {
  test('DEMO transaction auto-confirms once more than 5 seconds have elapsed', async () => {
    // The controller now computes elapsed time in SQL (TIMESTAMPDIFF),
    // not by parsing created_at in JS — mock elapsed_seconds directly so
    // this test is deterministic regardless of the machine's local
    // timezone (a plain "YYYY-MM-DD HH:MM:SS" string with no timezone
    // marker, like created_at below, gets parsed as LOCAL time by JS,
    // which silently broke on any machine not running in UTC).
    const pool = mockPool({
      'SELECT *, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed_seconds FROM mpesa_transactions WHERE checkout_request_id=?': [[{
        id: 1, checkout_request_id: 'DEMO12345678', status: 'pending',
        amount: 1000, phone: '254712345678', invoice_id: 10, tenancy_id: 3,
        created_at: '2024-01-01 00:00:00', elapsed_seconds: 10,
      }]],
      "UPDATE mpesa_transactions SET status='completed' WHERE id=? AND status='pending'": [{ affectedRows: 1 }],
      'UPDATE mpesa_transactions SET transaction_code=?': [{ affectedRows: 1 }],
      'SELECT * FROM invoices WHERE id=?': [[{ id: 10, balance: 1000, org_id: 1 }]],
      'INSERT INTO payments': [{ insertId: 55 }],
      'INSERT INTO receipt_sequences': [{ affectedRows: 1 }],
      'SELECT next_val-1 AS n FROM receipt_sequences': [[{ n: 6 }]],
      'INSERT INTO receipts': [{ insertId: 1 }],
      'UPDATE invoices SET balance=?': [{ affectedRows: 1 }],
      'SELECT org_id FROM invoices WHERE id=?': [[{ org_id: 1 }]],
    });
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/payments')];
    const c = require('../controllers/admin/payments');

    const req = mockReq({ user: makeUser('super_admin', { org_id: 1 }), params: { checkout_id: 'DEMO12345678' } });
    const res = mockRes();
    await c.checkStk(req, res);

    res.assertSuccess();
    assert.equal(res._body.status, 'completed', 'Demo STK should auto-confirm after 5s');
    assert.ok(res._body.transaction_code, 'Should have a demo transaction code');
  });

  test('DEMO transaction stays pending within the 5 second window', async () => {
    const pool = mockPool({
      'SELECT *, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed_seconds FROM mpesa_transactions WHERE checkout_request_id=?': [[{
        id: 2, checkout_request_id: 'DEMO87654321', status: 'pending',
        amount: 1000, phone: '254712345678', invoice_id: 11, tenancy_id: 4,
        created_at: '2024-01-01 00:00:00', elapsed_seconds: 2, // well under 5s
      }]],
      'SELECT org_id FROM invoices WHERE id=?': [[{ org_id: 1 }]],
    });
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/payments')];
    const c = require('../controllers/admin/payments');

    const req = mockReq({ user: makeUser('super_admin', { org_id: 1 }), params: { checkout_id: 'DEMO87654321' } });
    const res = mockRes();
    await c.checkStk(req, res);

    res.assertSuccess();
    assert.equal(res._body.status, 'pending', 'Demo STK should be pending within the 5s window');
  });
});

// -- Callback processing (controllers/admin/mpesaStk.js#callback) --
describe('M-Pesa callback', () => {
  test('successful callback marks the transaction confirmed and records a payment', async () => {
    const pool = mockPool({
      'SELECT * FROM mpesa_transactions WHERE checkout_request_id=?': [[{
        id: 1, checkout_request_id: 'ws_CO_test123', status: 'pending',
        amount: 5000, phone: '254712345678', invoice_id: 10, tenancy_id: 3,
      }]],
      'UPDATE mpesa_transactions SET status=?': [{ affectedRows: 1 }],
      'SELECT balance, org_id FROM invoices WHERE id=?': [[{ balance: 5000, org_id: 7 }]],
      'INSERT INTO payments': [{ insertId: 55 }],
      'SELECT COUNT(*) AS n FROM receipts': [[{ n: 100 }]],
      'INSERT INTO receipts': [{ insertId: 77 }],
      'UPDATE invoices SET balance=?': [{ affectedRows: 1 }],
      'INSERT INTO tenant_ledger': [{ insertId: 1 }],
    });

    // The payment/receipt/ledger inserts happen inside a transaction via
    // pool.getConnection() -> conn.query(), which the mock tracks
    // separately from pool._calls (same pattern as
    // tests/invoices.test.js's bulkGenerate transaction tests).
    const connCalls = [];
    const origGetConnection = pool.getConnection;
    pool.getConnection = async () => {
      const conn = await origGetConnection();
      const origQuery = conn.query;
      conn.query = async (sql, params) => { connCalls.push({ sql, params }); return origQuery(sql, params); };
      return conn;
    };

    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/mpesaStk')];
    const c = require('../controllers/admin/mpesaStk');

    const successCallback = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'test_merchant',
          CheckoutRequestID: 'ws_CO_test123',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount',             Value: 5000 },
              { Name: 'MpesaReceiptNumber', Value: 'QHX123ABC456' },
              { Name: 'TransactionDate',    Value: 20240115120000 },
              { Name: 'PhoneNumber',        Value: 254712345678 },
            ],
          },
        },
      },
    };

    const req = mockReq({ body: successCallback });
    const res = mockRes();
    await c.callback(req, res);

    // Callback endpoint returns 200 immediately (Safaricom requirement).
    assert.equal(res.statusCode, 200, 'Callback must always return 200');

    const paymentInsert = connCalls.find(c => c.sql.includes('INSERT INTO payments'));
    assert.ok(paymentInsert, 'should record a payment for a successful callback');
    assert.equal(paymentInsert.params[0], 10, 'payment should be linked to the correct invoice_id');
    assert.equal(paymentInsert.params.at(-1), 7, 'payment should be stamped with the invoice\'s real org_id (7), not silently default to org 1 via the column default');
  });

  test('failed callback (ResultCode != 0) marks the transaction failed', async () => {
    const pool = mockPool({
      'SELECT * FROM mpesa_transactions WHERE checkout_request_id=?': [[{
        id: 2, checkout_request_id: 'ws_CO_fail001', status: 'pending',
        amount: 3000, phone: '254722000000', invoice_id: 20, tenancy_id: 5,
      }]],
      'UPDATE mpesa_transactions SET status=?,result_code=?': [{ affectedRows: 1 }],
    });

    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/mpesaStk')];
    const c = require('../controllers/admin/mpesaStk');

    const failCallback = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'test_fail',
          CheckoutRequestID: 'ws_CO_fail001',
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user.',
        },
      },
    };

    const req = mockReq({ body: failCallback });
    const res = mockRes();
    await c.callback(req, res);
    assert.equal(res.statusCode, 200, 'Callback must still return 200 on failure');

    await new Promise(r => setImmediate(r));
    const updateCall = pool._calls.find(
      c => c.sql.includes('UPDATE mpesa_transactions') && c.params?.includes('cancelled')
    );
    assert.ok(updateCall, 'should update transaction status to cancelled for ResultCode 1032');
  });

  test('duplicate callback does not create a duplicate payment (idempotency guard)', async () => {
    const pool = mockPool({
      'SELECT * FROM mpesa_transactions WHERE checkout_request_id=?': [[{
        id: 3, checkout_request_id: 'ws_CO_dup001', status: 'completed', // already processed
        amount: 2000, phone: '254733000000', invoice_id: 30, tenancy_id: 7,
      }]],
    });

    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/mpesaStk')];
    const c = require('../controllers/admin/mpesaStk');

    const req = mockReq({ body: { Body: { stkCallback: {
      CheckoutRequestID: 'ws_CO_dup001', ResultCode: 0,
      CallbackMetadata: { Item: [{ Name: 'Amount', Value: 2000 }, { Name: 'MpesaReceiptNumber', Value: 'DUP123' }] },
    }}}});
    const res = mockRes();
    await c.callback(req, res);
    assert.equal(res.statusCode, 200);

    await new Promise(r => setImmediate(r));
    const insertPayment = pool._calls.find(c => c.sql.includes('INSERT INTO payments'));
    assert.equal(insertPayment, undefined, 'should not insert a duplicate payment for an already-completed transaction');
  });
});

// -- IP allowlisting (middleware/safaricomIp.js) -------------------
describe('M-Pesa callback IP allowlisting', () => {
  const { safaricomOnly } = require('../middleware/safaricomIp');

  test('callback from an unknown IP is rejected in production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req = { headers: { 'x-forwarded-for': '1.2.3.4' }, ip: '1.2.3.4' };
    const res = mockRes();
    let nextCalled = false;
    safaricomOnly(req, res, () => { nextCalled = true; });

    process.env.NODE_ENV = origEnv;
    assert.equal(nextCalled, false, 'should not call next() for a non-Safaricom IP');
    assert.equal(res.statusCode, 403, 'should reject callback from non-Safaricom IP in production');
  });

  test('callback from a Safaricom IP is accepted in production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req = { headers: { 'x-forwarded-for': '196.201.214.200' }, ip: '196.201.214.200' };
    const res = mockRes();
    let nextCalled = false;
    safaricomOnly(req, res, () => { nextCalled = true; });

    process.env.NODE_ENV = origEnv;
    assert.equal(nextCalled, true, 'should call next() for an allowlisted Safaricom IP');
  });

  test('a spoofed X-Forwarded-For header alone is rejected — only req.ip counts', () => {
    // Regression test for the trust-proxy fix: before it, this middleware
    // read req.headers['x-forwarded-for'] directly, so an attacker could
    // simply set that header to a real Safaricom IP and forge a "payment
    // successful" callback. Now only req.ip (which Express resolves
    // itself, honoring app.js's trust proxy setting) is trusted — a
    // request whose header claims to be Safaricom but whose actual
    // resolved req.ip is something else must still be rejected.
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req = { headers: { 'x-forwarded-for': '196.201.214.200' }, ip: '45.45.45.45' };
    const res = mockRes();
    let nextCalled = false;
    safaricomOnly(req, res, () => { nextCalled = true; });

    process.env.NODE_ENV = origEnv;
    assert.equal(nextCalled, false, 'a spoofed header must not bypass the allowlist when req.ip is not a Safaricom IP');
    assert.equal(res.statusCode, 403);
  });

  test('any IP is accepted outside production (sandbox/dev callbacks)', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const req = { headers: { 'x-forwarded-for': '8.8.8.8' }, ip: '8.8.8.8' };
    const res = mockRes();
    let nextCalled = false;
    safaricomOnly(req, res, () => { nextCalled = true; });

    process.env.NODE_ENV = origEnv;
    assert.equal(nextCalled, true, 'non-production should allow all IPs through');
  });
});
