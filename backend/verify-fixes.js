#!/usr/bin/env node
'use strict';
/**
 * SmartNyumba Pro — one-shot verification script
 * Checks the live backend for every bug fixed in this session.
 *
 * Usage:
 *   cd backend
 *   node verify-fixes.js
 *
 * Optional env vars (skips the login-dependent checks if omitted):
 *   TEST_EMAIL=admin@smartnyumba.com TEST_PASSWORD=yourpassword node verify-fixes.js
 *
 * To check EVERY role the system supports in one run, use TEST_ACCOUNTS instead
 * (a JSON array — one entry per role you want covered):
 *
 *   PowerShell:
 *     $env:TEST_ACCOUNTS = '[
 *       {"role":"super_admin","identifier":"admin@smartnyumba.com","password":"Admin@1234"},
 *       {"role":"property_manager","identifier":"pm@smartnyumba.com","password":"..."},
 *       {"role":"owner","identifier":"owner@smartnyumba.com","password":"..."},
 *       {"role":"caretaker","identifier":"caretaker@smartnyumba.com","password":"..."},
 *       {"role":"security","identifier":"security@smartnyumba.com","password":"..."},
 *       {"role":"tenant","identifier":"tenant@smartnyumba.com","password":"..."}
 *     ]'
 *     node verify-fixes.js
 *
 *   For each account it checks: login, /auth/me, /api/dashboard, and (for the
 *   'owner' role specifically) /api/owner/dashboard — the endpoint with today's fixes.
 *
 * Requires Node 18+ (uses built-in fetch). No npm install needed.
 */

const BASE = process.env.API_URL || 'http://localhost:3002';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

let pass = 0, fail = 0, skip = 0;
const results = [];

function record(name, status, detail = '') {
  if (status === 'PASS') pass++;
  else if (status === 'FAIL') fail++;
  else skip++;
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️ ';
  console.log(`${icon} ${name}${detail ? ' — ' + detail : ''}`);
}

async function safeFetch(path, opts = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(opts.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    return { ok: true, status: res.status, body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log(`\nChecking ${BASE} ...\n`);

  // 1. Server is up at all
  const health = await safeFetch('/health');
  if (!health.ok) {
    record('Server reachable', 'FAIL', health.error + ' — is nodemon running?');
    printSummary();
    process.exitCode = 1;
    return;
  }
  record('Server reachable', 'PASS', `status ${health.status}`);

  // 2. M-Pesa STK callback route exists and is no longer a bare 404
  //    (confirms routes/mpesaStk.js is mounted; doesn't confirm IP-guard,
  //    since that only activates in NODE_ENV=production)
  const stkCallback = await safeFetch('/api/mpesa/stk/callback', {
    method: 'POST',
    body: JSON.stringify({ Body: { stkCallback: { ResultCode: 1, ResultDesc: 'test' } } }),
  });
  if (stkCallback.status === 404) {
    record('M-Pesa STK callback route mounted', 'FAIL', 'got 404 — route missing');
  } else if (stkCallback.status === 403) {
    record('M-Pesa STK callback route mounted', 'PASS', 'reachable, IP-guard active (production mode)');
  } else {
    record('M-Pesa STK callback route mounted', 'PASS', `reachable, status ${stkCallback.status} (dev mode allows all IPs — this is expected locally)`);
  }

  // 3. CSRF exemption covers the STK callback path (no 403 CSRF-specific rejection)
  if (stkCallback.body?.error?.includes('CSRF')) {
    record('CSRF exemption covers /mpesa/stk/callback', 'FAIL', 'got CSRF rejection — app.js fix not applied');
  } else {
    record('CSRF exemption covers /mpesa/stk/callback', 'PASS');
  }

  // 4. err()/CODES wiring — hit an endpoint likely to return a structured error
  //    A bad login attempt is a safe, side-effect-free way to check error shape.
  const badLogin = await safeFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'nonexistent-verify-script@example.com', password: 'wrong' }),
  });
  if (badLogin.status === 401 || badLogin.status === 400) {
    record('Structured error response from helpers.js', 'PASS', `status ${badLogin.status}, body has "error" field: ${!!badLogin.body?.error}`);
  } else {
    record('Structured error response from helpers.js', 'FAIL', `unexpected status ${badLogin.status}`);
  }

  // 5. Per-role checks
  // Provide one or more test accounts as TEST_ACCOUNTS='[{"role":"tenant","identifier":"...","password":"..."}, ...]'
  // Falls back to a single account via TEST_EMAIL/TEST_PASSWORD (role unknown, dashboard check still runs).
  let accounts = [];
  if (process.env.TEST_ACCOUNTS) {
    try { accounts = JSON.parse(process.env.TEST_ACCOUNTS); }
    catch (e) { console.error('TEST_ACCOUNTS is not valid JSON:', e.message); }
  } else if (EMAIL && PASSWORD) {
    accounts = [{ role: '(unspecified)', identifier: EMAIL, password: PASSWORD }];
  }

  if (accounts.length === 0) {
    record('Per-role checks (needs TEST_ACCOUNTS or TEST_EMAIL/TEST_PASSWORD)', 'SKIP');
  } else {
    for (const acct of accounts) {
      const label = `[${acct.role}] `;
      const login = await safeFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: acct.identifier, password: acct.password }),
      });
      if (!login.ok || login.status !== 200 || !login.body?.access_token) {
        record(`${label}Login`, 'FAIL', `status ${login.status} — ${login.body?.error || login.error || 'no token returned'}`);
        continue; // can't check anything else for this account without a token
      }
      record(`${label}Login`, 'PASS');
      const token = login.body.access_token;
      const authHeader = { Authorization: `Bearer ${token}` };

      const me = await safeFetch('/api/auth/me', { headers: authHeader });
      record(`${label}/auth/me`, me.status === 200 ? 'PASS' : 'FAIL', `status ${me.status}`);

      const dash = await safeFetch('/api/dashboard', { headers: authHeader });
      record(`${label}/api/dashboard`, dash.status === 200 ? 'PASS' : 'FAIL', `status ${dash.status}`);

      // Owner has its own dedicated dashboard (the one with the safeErr/remittance-type fixes)
      if (acct.role === 'owner') {
        const ownerDash = await safeFetch('/api/owner/dashboard', { headers: authHeader });
        record(`${label}/api/owner/dashboard`, ownerDash.status === 200 ? 'PASS' : 'FAIL', `status ${ownerDash.status}`);
      }

      // Only run the password-endpoint smoke test (non-mutating) for the first account,
      // to avoid hammering /auth/change-password with N accounts unnecessarily.
      if (acct === accounts[0]) {
        const changePw = await safeFetch('/api/auth/change-password', {
          method: 'PUT',
          headers: authHeader,
          body: JSON.stringify({ current_password: 'deliberately-wrong-for-verify-script', new_password: 'irrelevant123!' }),
        });
        if (changePw.status === 500) {
          record(`${label}changePassword endpoint (password_hash fix)`, 'FAIL', 'got 500 — likely still missing password_hash in SELECT');
        } else {
          record(`${label}changePassword endpoint (password_hash fix)`, 'PASS', `status ${changePw.status} (expected 400/401, not 500)`);
        }
      }
    }
  }

  printSummary();
}

function printSummary() {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed, ${skip} skipped`);
  if (skip > 0) {
    console.log(`\nRun with TEST_EMAIL and TEST_PASSWORD env vars to check the login-dependent fixes too:`);
    console.log(`  TEST_EMAIL=you@example.com TEST_PASSWORD=yourpass node verify-fixes.js`);
  }
  if (fail > 0) process.exitCode = 1;
}

main().catch(e => { console.error('Script crashed:', e); process.exitCode = 1; });