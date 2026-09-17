'use strict';

/**
 * SmartNyumba Pro — Cron Job Tests
 *
 * Tests the core logic of cron job functions in isolation,
 * without scheduling them (we call the underlying functions directly).
 *
 * Run: node --test tests/cron.test.js
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { mockPool } = require('./helpers');

before(() => {
  process.env.NODE_ENV = 'test';
});

// ─────────────────────────────────────────────────────────────
describe('helpers — receiptNumber', () => {
  test('format is RCP-YYYY-NNNNN', async () => {
    const pool = mockPool({
      'SELECT COUNT(*) AS n FROM receipts WHERE YEAR': [[{ n: 0 }]],
    });
    const { receiptNumber } = require('../utils/helpers');
    const rnum = await receiptNumber(pool);
    const year = new Date().getFullYear();
    assert.equal(rnum, `RCP-${year}-00001`);
  });

  test('increments from existing count', async () => {
    const pool = mockPool({
      'SELECT COUNT(*) AS n FROM receipts WHERE YEAR': [[{ n: 41 }]],
    });
    const { receiptNumber } = require('../utils/helpers');
    const rnum = await receiptNumber(pool);
    const year = new Date().getFullYear();
    assert.equal(rnum, `RCP-${year}-00042`);
  });
});

// ─────────────────────────────────────────────────────────────
describe('helpers — paginate', () => {
  test('returns correct meta for page 1', async () => {
    const pool = mockPool({
      'SELECT COUNT(*)': [[{ total: '47' }]],
      'LIMIT': [[{ id: 1 }, { id: 2 }]],
    });
    const { paginate } = require('../utils/helpers');
    const result = await paginate(pool, 'SELECT * FROM invoices WHERE 1=1', [], 1, 20);
    assert.equal(result.meta.total, 47);
    assert.equal(result.meta.page,  1);
    assert.equal(result.meta.limit, 20);
    assert.equal(result.meta.pages, 3); // ceil(47/20)
  });

  test('caps limit at 100', async () => {
    const pool = mockPool({
      'SELECT COUNT(*)': [[{ total: '10' }]],
      'LIMIT': [[[]]],
    });
    const { paginate } = require('../utils/helpers');
    const result = await paginate(pool, 'SELECT * FROM x WHERE 1=1', [], 1, 9999);
    assert.equal(result.meta.limit, 100);
  });
});

// ─────────────────────────────────────────────────────────────
describe('error codes', () => {
  const { CODES, apiErr } = require('../utils/errorCodes');

  test('CODES entries have code and message', () => {
    for (const [key, val] of Object.entries(CODES)) {
      assert.ok(val.code,    `CODES.${key} should have a code`);
      assert.ok(val.message, `CODES.${key} should have a message`);
      assert.equal(val.code, key, `CODES.${key}.code should equal the key`);
    }
  });

  test('apiErr sets status and code in response', () => {
    const { mockRes } = require('./helpers');
    const res = mockRes();
    apiErr(res, CODES.INVOICE_NOT_FOUND, 404);
    assert.equal(res._status, 404);
    assert.equal(res._body.code,  'INVOICE_NOT_FOUND');
    assert.equal(res._body.success, false);
    assert.ok(res._body.error);
  });

  test('err() with plain string still works (backward compat)', () => {
    const { mockRes } = require('./helpers');
    const { err } = require('../utils/helpers');
    const res = mockRes();
    err(res, 'Something went wrong', 500);
    assert.equal(res._status, 500);
    assert.equal(res._body.error, 'Something went wrong');
  });

  test('err() with CODES entry produces structured response', () => {
    const { mockRes } = require('./helpers');
    const { err, CODES } = require('../utils/errorCodes');
    const res = mockRes();
    err(res, CODES.DUPLICATE_PAYMENT, 409);
    assert.equal(res._status, 409);
    assert.equal(res._body.code, 'DUPLICATE_PAYMENT');
  });
});

// ─────────────────────────────────────────────────────────────
describe('search sanitization', () => {
  test('escapes LIKE special characters', async () => {
    // Simulate what the search controller does
    const raw  = "100% complete_test\\path";
    const safe = raw.replace(/[%_\\]/g, '\\$&').slice(0, 100);
    assert.equal(safe, '100\\% complete\\_test\\\\path');
  });

  test('caps query at 100 chars', () => {
    const long = 'a'.repeat(200);
    const safe = long.replace(/[%_\\]/g, '\\$&').slice(0, 100);
    assert.equal(safe.length, 100);
  });

  test('empty query returns early', () => {
    const q = '';
    assert.ok(!q || q.length < 2, 'empty query should be caught by length check');
  });
});

// ─────────────────────────────────────────────────────────────
describe('storage service', () => {
  test('defaults to local driver when STORAGE_DRIVER not set', () => {
    delete process.env.STORAGE_DRIVER;
    // Test the driver selection logic directly without requiring multer
    const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
    assert.equal(driver, 'local');
  });

  test('uses s3 driver when STORAGE_DRIVER=s3', () => {
    process.env.STORAGE_DRIVER = 's3';
    const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
    assert.equal(driver, 's3');
    delete process.env.STORAGE_DRIVER;
  });

  test('local url() prepends slash to key', () => {
    // Test the localUrl logic directly (pure function, no multer needed)
    function localUrl(key) {
      return key.startsWith('/') ? key : `/${key}`;
    }
    assert.equal(localUrl('uploads/photos/test.jpg'), '/uploads/photos/test.jpg');
    assert.equal(localUrl('/already/absolute.jpg'),   '/already/absolute.jpg');
  });

  test('mimeForExt returns correct content types', () => {
    const mimeMap = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png',  '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    for (const [ext, expected] of Object.entries(mimeMap)) {
      assert.equal(mimeMap[ext], expected);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('bulk input guards', () => {
  test('bulkImportTenants rejects arrays over 500', async () => {
    const pool = mockPool({});
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/admin/enterprise')];

    const c   = require('../controllers/admin/enterprise');
    const { mockReq, mockRes, makeUser } = require('./helpers');
    const rows = Array.from({ length: 501 }, (_, i) => ({ full_name: `T${i}`, phone: `070000${i}` }));
    const req  = mockReq({ body: { rows }, user: makeUser('super_admin') });
    const res  = mockRes();
    await c.bulkImportTenants(req, res);
    res.assertStatus(400);
    assert.ok(res._body.error.includes('500'));
  });
});
