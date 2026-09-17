'use strict';

/**
 * SmartNyumba Pro — Test Helpers
 *
 * Provides:
 *   - mockPool()       in-memory DB mock (avoids real MySQL in unit tests)
 *   - mockReq(opts)    Express request mock
 *   - mockRes()        Express response mock with assertion helpers
 *   - makeUser(role)   user fixture factory
 *   - makeInvoice()    invoice fixture factory
 *   - makePayment()    payment fixture factory
 */

// ── Mock DB pool ──────────────────────────────────────────────
function mockPool(queryMap = {}) {
  const calls = [];

  const pool = {
    _calls: calls,
    _map:   queryMap,

    query: async (sql, params = []) => {
      calls.push({ sql: sql.trim(), params });

      // Find matching mock response by checking if sql contains a key substring
      for (const [pattern, result] of Object.entries(queryMap)) {
        if (sql.includes(pattern)) {
          if (typeof result === 'function') return result(sql, params);
          return result;
        }
      }
      // Default: return empty result set
      return [[]];
    },

    getConnection: async () => {
      const conn = {
        _calls: [],
        beginTransaction: async () => {},
        commit:           async () => {},
        rollback:         async () => {},
        release:          ()      => {},
        query: async (sql, params = []) => {
          conn._calls.push({ sql, params });
          for (const [pattern, result] of Object.entries(queryMap)) {
            if (sql.includes(pattern)) {
              if (typeof result === 'function') return result(sql, params);
              return result;
            }
          }
          return [{ insertId: 1, affectedRows: 1 }];
        },
      };
      return conn;
    },
  };

  return pool;
}

// ── Mock Express request ──────────────────────────────────────
function mockReq(opts = {}) {
  return {
    body:    opts.body    || {},
    params:  opts.params  || {},
    query:   opts.query   || {},
    headers: opts.headers || {},
    user:    opts.user    || makeUser('super_admin'),
    socket:  { remoteAddress: '127.0.0.1' },
    ...opts,
  };
}

// ── Mock Express response ─────────────────────────────────────
function mockRes() {
  const res = {
    _status:  200,
    _body:    null,
    _headers: {},

    // Real Express exposes `res.statusCode` directly (set as a side effect
    // of .status()/.send()/.json()) — several tests assumed that and used
    // `res.statusCode`, which didn't exist on this mock, so it silently
    // compared against `undefined` instead of failing loudly. Exposing it
    // for real (mirroring `_status`) fixes those tests and stops this
    // shape of bug from recurring in future ones.
    get statusCode() { return this._status; },

    status(code) { this._status = code; return this; },
    json(body)   { this._body   = body; return this; },
    send(body)   { this._body   = body; return this; },
    // Real login/refresh code paths call res.cookie()/clearCookie()
    // (setRefreshCookie/clearRefreshCookie in utils/helpers.js) — without
    // these, any test that exercises the real login() controller (not
    // just the JWT middleware in isolation) throws "res.cookie is not a
    // function" before ever reaching its own assertions.
    _cookies: {},
    cookie(name, value, opts) { this._cookies[name] = { value, opts }; return this; },
    clearCookie(name) { delete this._cookies[name]; return this; },
    set(k, v)    { this._headers[k] = v; return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
    end()        { return this; },
    on()         { return this; },

    // Assertion helpers
    assertStatus(expected, msg) {
      if (this._status !== expected) {
        throw new Error(`${msg || 'Status'}: expected ${expected}, got ${this._status}. Body: ${JSON.stringify(this._body)}`);
      }
    },
    assertSuccess() {
      if (!this._body?.success) {
        throw new Error(`Expected success:true, got: ${JSON.stringify(this._body)}`);
      }
    },
    assertError(codeOrMsg) {
      if (this._body?.success !== false && !this._body?.error) {
        throw new Error(`Expected error response, got: ${JSON.stringify(this._body)}`);
      }
      if (codeOrMsg) {
        const matches = this._body?.code === codeOrMsg || this._body?.error?.includes(codeOrMsg);
        if (!matches) {
          throw new Error(`Expected error "${codeOrMsg}", got: ${JSON.stringify(this._body)}`);
        }
      }
    },
  };
  return res;
}

// ── Fixtures ──────────────────────────────────────────────────
let _idCounter = 1;

function makeUser(role = 'tenant', overrides = {}) {
  return {
    id:            _idCounter++,
    sub:           _idCounter,
    full_name:     'Test User',
    email:         `test${_idCounter}@smartnyumba.test`,
    phone:         `0700${String(_idCounter).padStart(6, '0')}`,
    role,
    is_active:     1,
    property_id:   null,
    password_hash: '$2b$12$placeholder',
    mfa_enabled:   0,
    ...overrides,
  };
}

function makeProperty(overrides = {}) {
  return {
    id:                  _idCounter++,
    name:                'Test Property',
    location:            'Nairobi',
    management_fee_pct:  5,
    owner_id:            null,
    manager_id:          null,
    ...overrides,
  };
}

function makeUnit(overrides = {}) {
  return {
    id:          _idCounter++,
    unit_number: `A${_idCounter}`,
    property_id: 1,
    rent_amount: 15000,
    status:      'occupied',
    type:        'one_bedroom',
    ...overrides,
  };
}

function makeTenant(overrides = {}) {
  return {
    id:      _idCounter++,
    user_id: _idCounter,
    ...overrides,
  };
}

function makeTenancy(overrides = {}) {
  return {
    id:          _idCounter++,
    tenant_id:   1,
    unit_id:     1,
    rent_amount: 15000,
    deposit:     30000,
    status:      'active',
    start_date:  '2024-01-01',
    end_date:    null,
    ...overrides,
  };
}

function makeInvoice(overrides = {}) {
  return {
    id:         _idCounter++,
    tenancy_id: 1,
    type:       'rent',
    amount:     15000,
    balance:    15000,
    status:     'unpaid',
    due_date:   '2024-02-01',
    ...overrides,
  };
}

function makePayment(overrides = {}) {
  return {
    id:               _idCounter++,
    invoice_id:       1,
    tenancy_id:       1,
    amount:           15000,
    payment_method:   'mpesa',
    transaction_code: 'QA1234567B',
    paid_at:          new Date().toISOString(),
    ...overrides,
  };
}

module.exports = {
  mockPool,
  mockReq,
  mockRes,
  makeUser,
  makeProperty,
  makeUnit,
  makeTenant,
  makeTenancy,
  makeInvoice,
  makePayment,
};
