'use strict';

/**
 * SmartNyumba Pro — Auth Tests (self-contained)
 * Run: node --test tests/auth.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { mockRes, mockPool } = require('./helpers');

process.env.JWT_SECRET = 'test_secret_min_32_chars_long_enough_xyz';
process.env.NODE_ENV   = 'test';

// BUG FIX: auth.js does a DB lookup (property_id/suspension refresh) for
// any role other than tenant/super_admin, as a real `require('../config/db')`
// call inside the module — with no mock in place, that's a live connection
// pool to whatever real DB the machine running these tests happens to have
// configured. On a machine with no reachable DB that failed fast and this
// was easy to miss; on a machine WITH a reachable DB, the pool opens for
// real and is never closed, which keeps the event loop alive after the
// test finishes ("Promise resolution is still pending but the event loop
// has already resolved") and makes the whole file hang until Node's test
// runner times it out. Mocking config/db here — before middleware/auth is
// required below — makes this file behave the same on every machine
// regardless of local DB config, matching every other test file's pattern.
require.cache[require.resolve('../config/db')] = {
  exports: mockPool({
    'SELECT property_id, is_suspended, is_active, suspension_reason FROM users WHERE id=? LIMIT 1':
      (sql, params) => {
        // sub:9 is the suspended-tenant fixture for the regression test below;
        // everyone else gets the normal not-suspended row.
        if (params && params[0] === 9) {
          return [[{ property_id: null, is_suspended: 1, is_active: 1, suspension_reason: null }]];
        }
        return [[{ property_id: null, is_suspended: 0, is_active: 1, suspension_reason: null }]];
      },
  }),
};

// ─────────────────────────────────────────────────────────────
describe('JWT auth middleware', () => {
  const auth = require('../middleware/auth');

  const makeReq = (token) => ({
    headers: token ? { authorization: `Bearer ${token}` } : {},
    socket:  { remoteAddress: '127.0.0.1' },
  });

  test('rejects no Authorization header', () => {
    const res = mockRes();
    auth()(makeReq(null), res, () => { throw new Error('should not call next'); });
    assert.equal(res._status, 401);
    assert.equal(res._body.error, 'Authentication required');
  });

  test('rejects malformed JWT', () => {
    const res = mockRes();
    auth()(makeReq('not.a.jwt'), res, () => { throw new Error('should not call next'); });
    assert.equal(res._status, 401);
  });

  test('rejects expired JWT', () => {
    const jwt = require('jsonwebtoken');
    const tok = jwt.sign({ sub: 1, role: 'tenant' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = mockRes();
    auth()(makeReq(tok), res, () => { throw new Error('should not call next'); });
    assert.equal(res._status, 401);
    assert.equal(res._body.code, 'TOKEN_EXPIRED');
  });

  test('rejects MFA-pending token on protected route', () => {
    const jwt = require('jsonwebtoken');
    const tok = jwt.sign({ sub: 1, type: 'mfa_pending' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const res = mockRes();
    auth()(makeReq(tok), res, () => { throw new Error('should not call next'); });
    assert.equal(res._status, 401);
    assert.equal(res._body.requires_mfa, true);
  });

  test('rejects insufficient role', async () => {
    const jwt = require('jsonwebtoken');
    const tok = jwt.sign({ sub: 2, role: 'tenant' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = mockRes();
    // Awaited: unlike the earlier synchronous-rejection tests above, a
    // `tenant` token now correctly goes through the async live-suspension
    // check (see middleware/auth.js) before reaching the role check —
    // that check must resolve before res._status reflects the outcome.
    await auth(['super_admin'])(makeReq(tok), res, () => { throw new Error('should not call next'); });
    assert.equal(res._status, 403);
  });

  test('calls next() and populates req.user for valid token', () => {
    const jwt = require('jsonwebtoken');
    const tok = jwt.sign({ sub: 5, role: 'super_admin', name: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = makeReq(tok);
    const res = mockRes();
    let called = false;
    auth(['super_admin'])(req, res, () => { called = true; });
    assert.ok(called);
    assert.equal(req.user.sub, 5);
  });

  test('allows any authenticated role when no restriction given', async () => {
    const jwt = require('jsonwebtoken');
    const tok = jwt.sign({ sub: 3, role: 'caretaker' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = makeReq(tok);
    const res = mockRes();
    let called = false;
    // auth() is async: for any role other than super_admin it does an
    // (awaited, try/catch-guarded) DB lookup for the live suspension
    // check (and, for staff roles, a property_id refresh) before calling
    // next() — must await it here, or the assertion below can run before
    // next() actually fires.
    await auth()(req, res, () => { called = true; });
    assert.ok(called);
  });

  test('rejects a suspended tenant, even with a still-valid JWT', async () => {
    // Regression test: this used to be broken — the live suspension
    // check explicitly skipped the tenant role, so a tenant suspended
    // after logging in kept full access until their token expired.
    // sub:9 is wired in the top-of-file mock to a is_suspended:1 row.
    const jwt = require('jsonwebtoken');
    const tok = jwt.sign({ sub: 9, role: 'tenant' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = mockRes();
    await auth()(makeReq(tok), res, () => { throw new Error('should not call next for a suspended tenant'); });
    assert.equal(res._status, 403);
    assert.equal(res._body.error, 'Account suspended');
  });
});

// ─────────────────────────────────────────────────────────────
describe('Error codes', () => {
  const { CODES, apiErr, err } = require('../utils/errorCodes');

  test('every CODES entry has matching .code key', () => {
    for (const [key, val] of Object.entries(CODES)) {
      assert.equal(val.code, key);
      assert.ok(val.message);
    }
  });

  test('apiErr produces correct HTTP response', () => {
    const res = mockRes();
    apiErr(res, CODES.INVOICE_NOT_FOUND, 404);
    assert.equal(res._status, 404);
    assert.equal(res._body.code, 'INVOICE_NOT_FOUND');
    assert.equal(res._body.success, false);
  });

  test('apiErr merges extra fields', () => {
    const res = mockRes();
    apiErr(res, CODES.VALIDATION, 422, { details: [{ field: 'email' }] });
    assert.ok(Array.isArray(res._body.details));
  });

  test('err() string is backward compatible', () => {
    const { err } = require('../utils/helpers');
    const res = mockRes();
    err(res, 'Something broke', 500);
    assert.equal(res._status, 500);
    assert.equal(res._body.error, 'Something broke');
  });

  test('err() with CODES entry is structured', () => {
    const { err, CODES } = require('../utils/errorCodes');
    const res = mockRes();
    err(res, CODES.DUPLICATE_PAYMENT, 409);
    assert.equal(res._body.code, 'DUPLICATE_PAYMENT');
  });
});

// ─────────────────────────────────────────────────────────────
describe('Password reset token security', () => {
  const crypto = require('crypto');
  const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

  test('token hash is deterministic', () => {
    const raw = crypto.randomBytes(48).toString('hex');
    assert.equal(hash(raw), hash(raw));
  });

  test('different tokens produce different hashes', () => {
    const t1 = crypto.randomBytes(48).toString('hex');
    const t2 = crypto.randomBytes(48).toString('hex');
    assert.notEqual(hash(t1), hash(t2));
  });

  test('raw token is 96 hex chars (48 bytes)', () => {
    const raw = crypto.randomBytes(48).toString('hex');
    assert.equal(raw.length, 96);
    assert.match(raw, /^[0-9a-f]+$/);
  });

  test('hash is 64 chars (SHA-256)', () => {
    assert.equal(hash('test').length, 64);
  });
});

// ─────────────────────────────────────────────────────────────
describe('Input validation patterns', () => {
  test('search LIKE escaping', () => {
    const raw  = "100% profit_loss\\path";
    const safe = raw.replace(/[%_\\]/g, '\\$&').slice(0, 100);
    assert.equal(safe, '100\\% profit\\_loss\\\\path');
  });

  test('search capped at 100 chars', () => {
    assert.equal('x'.repeat(200).slice(0, 100).length, 100);
  });

  test('valid M-Pesa codes match pattern', () => {
    for (const c of ['QK12345678', 'AB1234567C', '0000000000']) {
      assert.match(c, /^[A-Z0-9]{10}$/);
    }
  });

  test('invalid M-Pesa codes do not match', () => {
    for (const c of ['SHORT', 'TOOLONGCODE1', 'HAS-HYPHEN', 'HAS SPACE1']) {
      assert.doesNotMatch(c, /^[A-Z0-9]{10}$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('Audit middleware', () => {
  const audit = require('../middleware/audit');

  test('calls next() immediately', () => {
    const req = { headers: {}, params: {}, body: {}, socket: { remoteAddress: '::1' } };
    const res = mockRes();
    let called = false;
    audit('TEST', 'units')(req, res, () => { called = true; });
    assert.ok(called);
  });
});

// ─────────────────────────────────────────────────────────────
describe('Login/logout audit trail', () => {
  const bcrypt = require('bcryptjs');
  const { mockPool, mockReq } = require('./helpers');

  const freshAuthController = (pool) => {
    require.cache[require.resolve('../config/db')] = { exports: pool };
    delete require.cache[require.resolve('../controllers/auth/index')];
    return require('../controllers/auth/index');
  };

  const lastAuditCall = (pool) => pool._calls.filter(c => c.sql.includes('INSERT INTO audit_events')).pop();

  test('records a failed login with no matching account (no actor to attribute it to)', async () => {
    const pool = mockPool({
      'SELECT id,full_name,email,phone,role,password_hash': [[]], // no user found
      'INSERT INTO audit_events': [{ insertId: 1 }],
    });
    const c = freshAuthController(pool);
    const req = mockReq({ body: { identifier: 'ghost@test.com', password: 'whatever' } });
    const res = mockRes();
    await c.login(req, res);
    assert.equal(res._status, 401);
    const audit = lastAuditCall(pool);
    assert.equal(audit.params[4], 'auth.login.failed');
    assert.equal(audit.params[1], null, 'no user matched — actor_id should be null, not a guess');
    assert.equal(audit.params[3], 'ghost@test.com', 'the attempted identifier should still be recorded');
  });

  test('records a failed login for a wrong password against a real account', async () => {
    const hash = bcrypt.hashSync('correctpass', 10);
    const pool = mockPool({
      'SELECT id,full_name,email,phone,role,password_hash': [[{
        id: 5, full_name: 'Jane', email: 'jane@test.com', phone: '0700000000',
        role: 'property_manager', password_hash: hash, is_active: 1, is_suspended: 0,
        property_id: null, mfa_enabled: 0, org_id: 3,
      }]],
      'INSERT INTO audit_events': [{ insertId: 1 }],
    });
    const c = freshAuthController(pool);
    const req = mockReq({ body: { identifier: 'jane@test.com', password: 'wrongpass' } });
    const res = mockRes();
    await c.login(req, res);
    assert.equal(res._status, 401);
    const audit = lastAuditCall(pool);
    assert.equal(audit.params[4], 'auth.login.failed');
    assert.equal(audit.params[1], 5, 'account was found, so actor_id should be attributed correctly');
  });

  test('records a successful login with the correct org_id', async () => {
    const hash = bcrypt.hashSync('correctpass', 10);
    const pool = mockPool({
      'SELECT id,full_name,email,phone,role,password_hash': [[{
        id: 5, full_name: 'Jane', email: 'jane@test.com', phone: '0700000000',
        role: 'property_manager', password_hash: hash, is_active: 1, is_suspended: 0,
        property_id: null, mfa_enabled: 0, org_id: 3,
      }]],
      'SELECT org_id FROM users WHERE id=?': [[{ org_id: 3 }]],
      'INSERT INTO refresh_tokens': [{ insertId: 1 }],
      'UPDATE users SET last_login': [{ affectedRows: 1 }],
      'INSERT INTO audit_events': [{ insertId: 1 }],
    });
    const c = freshAuthController(pool);
    const req = mockReq({ body: { identifier: 'jane@test.com', password: 'correctpass' } });
    const res = mockRes();
    await c.login(req, res);
    assert.equal(res._status, 200);
    const audit = lastAuditCall(pool);
    assert.equal(audit.params[4], 'auth.login.success');
    assert.equal(audit.params[1], 5);
    assert.equal(audit.params[0], 3, 'must use the real org_id, not the column default');
  });

  test('records a suspended-account login attempt distinctly from a bad password', async () => {
    const hash = bcrypt.hashSync('correctpass', 10);
    const pool = mockPool({
      'SELECT id,full_name,email,phone,role,password_hash': [[{
        id: 5, full_name: 'Jane', email: 'jane@test.com', phone: '0700000000',
        role: 'property_manager', password_hash: hash, is_active: 1, is_suspended: 1,
        property_id: null, mfa_enabled: 0, org_id: 3,
      }]],
      'INSERT INTO audit_events': [{ insertId: 1 }],
    });
    const c = freshAuthController(pool);
    const req = mockReq({ body: { identifier: 'jane@test.com', password: 'correctpass' } });
    const res = mockRes();
    await c.login(req, res);
    assert.equal(res._status, 403);
    const audit = lastAuditCall(pool);
    assert.equal(audit.params[4], 'auth.login.blocked_suspended');
  });

  test('records logout', async () => {
    const pool = mockPool({ 'INSERT INTO audit_events': [{ insertId: 1 }] });
    const c = freshAuthController(pool);
    const req = mockReq({ user: { sub: 5, role: 'property_manager', email: 'jane@test.com', org_id: 3 } });
    const res = mockRes();
    await c.logout(req, res);
    assert.equal(res._status, 200);
    const audit = lastAuditCall(pool);
    assert.equal(audit.params[4], 'auth.logout');
    assert.equal(audit.params[1], 5);
  });
});
