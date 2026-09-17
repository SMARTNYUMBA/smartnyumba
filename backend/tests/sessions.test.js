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
  delete require.cache[require.resolve('../controllers/admin/organisations')];
  return require('../controllers/admin/organisations');
};

describe('Active sessions', () => {
  test('lists active sessions scoped to the caller\'s org', async () => {
    const pool = mockPool({
      'SELECT COUNT(*) AS total FROM (': [[{ total: 1 }]],
      'FROM refresh_tokens rt': [[
        { id: 1, user_id: 5, full_name: 'Jane', email: 'jane@test.com', role: 'property_manager', logged_in_at: '2026-01-01 10:00:00', expires_at: '2026-01-08 10:00:00' },
      ]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin', { org_id: 1 }), query: {} });
    const res = mockRes();
    await c.activeSessions(req, res);
    res.assertSuccess();
    assert.equal(res._body.data.length, 1);
    assert.equal(res._body.data[0].full_name, 'Jane');
    const scoped = pool._calls.every(c => !c.sql.includes('org_id') || c.params.includes(1));
    assert.ok(scoped, 'every query should be scoped by the caller\'s org_id');
  });

  test('excludes expired sessions', async () => {
    const pool = mockPool({
      'SELECT COUNT(*) AS total FROM (': [[{ total: 0 }]],
      'FROM refresh_tokens rt': [[]],
    });
    const c = freshController(pool);
    const req = mockReq({ user: makeUser('super_admin', { org_id: 1 }), query: {} });
    const res = mockRes();
    await c.activeSessions(req, res);
    res.assertSuccess();
    const call = pool._calls.find(c => c.sql.includes('FROM refresh_tokens rt'));
    assert.ok(call.sql.includes('expires_at > NOW()'), 'must filter out expired sessions');
  });
});

describe('Revoke session', () => {
  test('a super_admin cannot revoke a session belonging to another org', async () => {
    // The JOIN + org_id filter means a cross-org session simply matches
    // zero rows — same fail-closed pattern as every other cross-org
    // lookup fixed elsewhere this session.
    const pool = mockPool({
      'DELETE rt FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id': [{ affectedRows: 0 }],
    });
    const c = freshController(pool);
    const req = mockReq({ params: { id: '99' }, user: makeUser('super_admin', { org_id: 1 }) });
    const res = mockRes();
    await c.revokeSession(req, res);
    res.assertStatus(404);
    const call = pool._calls.find(c => c.sql.includes('DELETE rt FROM refresh_tokens'));
    assert.ok(call.params.includes(1), 'lookup must be scoped by the caller\'s org_id');
  });

  test('revokes a session belonging to the caller\'s own org', async () => {
    const pool = mockPool({
      'DELETE rt FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id': [{ affectedRows: 1 }],
    });
    const c = freshController(pool);
    const req = mockReq({ params: { id: '5' }, user: makeUser('super_admin', { org_id: 1 }) });
    const res = mockRes();
    await c.revokeSession(req, res);
    res.assertSuccess();
  });
});
