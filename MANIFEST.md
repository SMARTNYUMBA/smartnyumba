# Smart Nyumba Pro — Consolidated Fixes

Every file changed across this whole review session, in one package.
Extract this at your project root — it overlays directly onto your
existing backend/ and frontend/ folders (same relative paths).

After extracting:
  1. cd backend && npm install     (adds cookie-parser)
  2. Set FLUTTERWAVE_WEBHOOK_HASH in your real .env (see .env.example)
  3. Restart both backend and frontend
  4. Re-run backend/verify-fixes.js if you still have it
  5. Log in again on every device — existing refresh tokens were
     stored in plaintext before this session's hashing fix, so old
     sessions won't validate against the new hashed lookup. This is
     expected, one-time, and not a bug.

## Backend

middleware/auth.js                        — wired to real cache.get/set (was calling undefined functions)
middleware/safaricomOnly.js               — NEW: shared IP-allowlist guard for M-Pesa callbacks
controllers/auth/index.js                 — changePassword fix, HttpOnly refresh cookie, hashed tokens, crypto OTP
controllers/auth/mfa.js                   — crypto OTP, HttpOnly refresh cookie, hashed tokens
controllers/auth/resetByEmail.js          — safeErr (was leaking raw error messages)
controllers/admin/users.js                — safeErr
controllers/admin/notifications.js        — safeErr
controllers/admin/invoice_control.js      — safeErr
controllers/admin/documents.js            — safeErr
controllers/admin/invoices.js             — safeErr
controllers/admin/vendorInvoices.js       — safeErr
controllers/admin/dashboard.js            — safeErr
controllers/admin/cases.js                — safeErr
controllers/admin/tenants.js              — crypto.randomBytes for auto-generated tenant passwords
controllers/admin/organisations.js        — HttpOnly refresh cookie + hashed tokens on org-signup login
controllers/admin/mpesaStk.js             — callback idempotency (was double-creditable), checkStatus IDOR fix
controllers/admin/payments.js             — demo-mode STK race condition (concurrent polls could double-credit)
controllers/admin/billing.js              — webhook signature verification (was a free-upgrade hole), fixed broken initiate()
controllers/owner/dashboard.js            — safeErr
controllers/owner/properties.js           — remittance notification mislabeled as deposit_refund
controllers/security/logbook.js           — safeErr
routes/settings.js                        — safeErr
routes/webhooks.js                        — safeErr
routes/maintenance.js                     — safeErr
routes/sms.js                             — safeErr
routes/mpesa.js                           — uses shared safaricomOnly middleware
routes/utilities.js                       — safeErr
routes/mpesaStk.js                        — was completely unguarded, now uses safaricomOnly
utils/helpers.js                          — err() now supports structured CODES entries
utils/refreshCookie.js                    — NEW: cookie set/clear + token hashing helpers
migrations/002_performance_indexes.js     — fixed backtick-escaping bug that broke this migration entirely
scripts/auto_migrate.js                   — fixed wrong column name (check_in_time -> check_in)
app.js                                    — cookie-parser, CSRF exemptions for mpesa/stk + billing/webhook
package.json                              — added cookie-parser dependency
.env.example                              — documented FLUTTERWAVE_SECRET_KEY / FLUTTERWAVE_WEBHOOK_HASH

## Frontend

src/main.jsx                              — now mounts the real App.jsx, not the debug login-only scaffold
src/context/AuthContext.jsx               — fixed React.useEffect crash, signOut now actually calls backend logout
src/api.js                                — refresh token no longer touches JS/sessionStorage, cookie-based only
src/components/ui/NotificationBell.jsx    — added 'remittance' notification type mapping
