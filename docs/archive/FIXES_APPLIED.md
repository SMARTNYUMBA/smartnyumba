# Fixes applied — Phase 0 (financial/security P0 items)

This zip is the uploaded project with the following changes. Everything
else — database, migrations, all other controllers/pages, docker/CI
config — is untouched from your original upload.

## 1. M-Pesa STK callback was completely unprotected
**Files:** `backend/middleware/safaricomIp.js` (new), `backend/routes/mpesa.js`,
`backend/routes/mpesaStk.js`, `backend/app.js`

`routes/mpesa.js` already had a Safaricom-IP allowlist on its `/callback`
route. `routes/mpesaStk.js` mounted the *same underlying handler* at
`/api/mpesa/stk/callback` with **no protection at all**. Since the STK
`initiate` endpoint returns the transaction's `checkout_request_id` to
whoever started the payment, anyone who initiated a real STK push could
forge a `{ResultCode: 0, ...}` callback to that unprotected URL and have
their invoice marked paid without actually paying.

Fix: extracted the IP-allowlist middleware into a shared module and
applied it to both callback routes. Also fixed the CSRF-exemption regex
in `app.js`, which only matched `/mpesa/callback` and would have
403'd a legitimate Safaricom callback on the `/mpesa/stk/callback` path.

## 2. Billing webhook (Flutterwave) trusted the request body
**File:** `backend/controllers/admin/billing.js`, `backend/services/flutterwave.js`

The webhook handler read `status`, `billing_invoice_id`, `plan`, and
`payment_ref` directly from `req.body` and upgraded the organisation's
plan if `status === 'successful'` — no signature check, no server-side
verification. Anyone who knew (or guessed) a `billing_invoice_id` could
POST a fake "successful" payment and get a free plan upgrade.

Also: the handler assumed a flat body shape that doesn't match
Flutterwave's actual webhook payload (`{ event, data: { id, status,
amount, meta, ... } }`), so it likely never worked correctly against
real Flutterwave webhooks even before considering security.

Fix:
- Verifies the `verif-hash` header via the `verifyWebhookSignature()`
  helper that already existed in `services/flutterwave.js` but was
  never called.
- Re-fetches the transaction from Flutterwave's API by ID
  (`verifyTransaction()`, also already existed, also never called) —
  status/amount/currency now come from that authoritative response,
  never from the webhook body.
- Cross-checks the verified amount and currency against the invoice.
- Is idempotent — a duplicate webhook delivery for an already-paid
  invoice is now a no-op instead of re-extending the plan expiry.
- `verifyWebhookSignature()` now fails closed in production if
  `FLUTTERWAVE_WEBHOOK_HASH` isn't configured, instead of silently
  skipping the check.
- Added the missing `FLUTTERWAVE_*` variables to `.env.example` — they
  weren't documented anywhere, so this webhook could never have been
  configured correctly even if someone wanted to.
- Also fixed an unrelated bug in `billing.initiate`:
  `require('../../services/flutterwave').catch(()=>null)` — `require()`
  isn't a promise, so this threw on every call and silently fell
  through to the manual M-Pesa fallback for every plan upgrade. Real
  Flutterwave checkout was effectively dead code before this fix.

## 3. Duplicate project trees removed
`backend/backend/` and `frontend/frontend/` — full stale copies of the
app from May 2026, superseded by the outer trees (last modified Sept
2026). Diffed both before deleting; nothing lived only in the nested
copies except one unreferenced, unused component
(`frontend/frontend/src/pages/shared/UnitLookup.jsx`) that isn't
imported anywhere in the live app — left out as dead code rather than
guessed back in. This roughly halved the project size on its own.

## 4. Stray files removed
`frontend/misc/` (a duplicate `migration_v2.sql` + a stray
`dockercompose.yml`), the duplicate `nginx .conf` (note the space,
alongside `nginx/nginx.conf`), `frontend/dist` (build artifact), and
`~$to do.docx` (a Word lock file that shouldn't have been in the zip).

## 5. Secrets and node_modules stripped from this zip
`backend/.env`, `backend/.env.staging`, and `frontend/.env` — which
contained real credentials — are **not included**. Only `.env.example`
is. `node_modules/` (257MB combined) is also stripped; run `npm install`
in `backend/` and `frontend/` after unzipping.

**You still need to rotate every credential that was in those original
`.env` files** — DB password, `JWT_SECRET`, M-Pesa consumer key/secret +
passkey, Africa's Talking key, SMTP password, and set a real
`FLUTTERWAVE_WEBHOOK_HASH`. I can't do that part for you — it requires
your actual provider dashboards.

---

---

# Phase 1 — Auth hardening

## 6. Refresh tokens are now real HttpOnly cookies, and hashed at rest
**Files:** `backend/utils/helpers.js`, `backend/controllers/auth/index.js`,
`backend/controllers/auth/mfa.js`, `backend/controllers/admin/organisations.js`

The frontend (`frontend/src/api.js`) already had comments and
`withCredentials: true` set up assuming the server sets an HttpOnly
refresh-token cookie in production — no backend code ever actually did
that. The token was always returned in the JSON body and stored in
`sessionStorage`, readable by any XSS bug. It was also stored in
**plaintext** in the `refresh_tokens` table.

Turns out there were **three separate places** issuing refresh tokens
this way, not one — password login, MFA verification (`mfa.verify`), and
organisation self-signup (`organisations.register`). All three now:
- Store `SHA-256(token)` in the DB instead of the raw token (same pattern
  already used for password-reset tokens).
- Call a shared `setRefreshCookie()` helper that sets it as
  `httpOnly, secure (prod), sameSite: 'strict', path: '/api/auth'`.
- Only echo the raw token in the JSON body outside production, matching
  the dev/sandbox fallback the frontend already expected.

`refresh` and `logout` now read the cookie first, falling back to the
request body only in dev. CORS already had `credentials: true` with an
explicit origin allowlist (not `*`), so no change was needed there for
cookies to work.

**Bonus bug fix, same area:** the token-refresh (`POST /api/auth/refresh`)
and MFA-verify paths were both re-issuing the JWT **without `org_id`** in
the payload, even though login includes it. Since this is a multi-tenant
app where `org_id` is how every controller scopes queries, this meant
`org_id` silently vanished from a user's session after the very first
token refresh (roughly every hour) or for any user with MFA enabled.
Fixed in both places.

## 7. MFA OTP now uses a CSPRNG
**File:** `backend/controllers/auth/mfa.js`

`generateOtp()` used `Math.random()`, which is not cryptographically
secure. Swapped for `crypto.randomInt(100000, 1000000)`.

## 8. Dead-code duplicate `/register` route removed
**File:** `frontend/src/App.jsx`

Not just a harmless duplicate — investigating it turned up something more
tangled: there are **two different org-signup wizards** in this codebase.
`OrgSignup.jsx` (206 lines, has a free-trial plan option) is mounted at
`/signup`. `Register.jsx` (140 lines, simpler) was *supposed* to be
mounted at `/register`, but that path was already claimed earlier in the
route list by `SelfRegister` (a different flow — tenants joining an
existing property via an invite link), which React Router matches first.
So `Register.jsx` has been completely unreachable dead code; the whole
time, anyone visiting `/register` got the tenant-invite form instead.

I removed the dead route and the now-unused `Register` import rather than
silently picking a winner between `Register.jsx` and `OrgSignup.jsx` —
that's a product call, not mine to make. The `Register.jsx` file is still
on disk if you want it back; you'll need to decide which wizard to keep
and give it its own path.

---

# Phase 2 (in progress) — Organisation isolation audit

This is the most serious finding of the whole review. **35 of ~50
controllers reference `org_id` zero times.** Only 7 (`apiKeys`, `billing`,
`import`, `invoice_control`, `kra_report`, `organisations`,
`tenant_transfer`) correctly scope queries with `WHERE id=? AND org_id=?`.
Practically every other resource — properties, units, tenants, tenancies,
invoices, payments, maintenance, visitors, vendors, expenses, documents,
cases — has no enforcement at all. Any authenticated user from one
organisation can read, edit, or delete another organisation's data by
guessing/incrementing a numeric ID.

## Fixed: `properties.js` (flagship example of the fix pattern)
- `getAll`: added `WHERE p.org_id=?` — previously a super_admin saw
  properties from **every** organisation on the platform, not just theirs.
- `getOne`, `update`, `delete`: added `AND org_id=?` to every by-ID lookup
  and to the UPDATE/DELETE statements themselves.
- `create`: **this was a write-side bug, not just read-side** — the
  `INSERT` never set `org_id`, so every property created by every
  organisation was silently landing in `org_id=1` (the column's
  `DEFAULT`). Now explicitly stamped from `req.user.org_id`.

## Fixed: `invoices.js`
- `getAll`: added org filter.
- `create`: verifies the tenancy being invoiced belongs to the caller's
  org before creating the invoice; stamps `org_id` on the new row.
- `update`, `markOverdue`: added org check — `update` previously didn't
  even check the invoice existed, let alone which org owned it.
- `bulkGenerate`: was scanning **every organisation's** active tenancies
  and bulk-creating invoices against them. Now scoped, and new invoices
  are stamped with `org_id`.
- `waiveFee`: added org check — previously anyone could zero out any
  invoice in the system by ID.

## Fixed: `payments.js`
- `getAll`: added org filter.
- `record`: **`invoice_id` and `tenancy_id` came straight from the
  request body and were never validated against each other or the
  caller's org** — a user could record a "payment" against any
  invoice/tenancy in the system, corrupting another organisation's
  balances and ledger. Now verified before the transaction runs, and
  `org_id` is stamped on the payment row.
- `initiateStk`: same missing validation — fixed the same way before
  kicking off a real M-Pesa STK push.
- `checkStk`: added an ownership check (derived via the invoice, since
  `mpesa_transactions` has no `org_id` column of its own) before allowing
  a status poll to proceed or auto-complete a payment; the demo/sandbox
  auto-complete path now stamps the correct `org_id` on the payment
  instead of defaulting to org 1.

## Fixed: `tenants.js`
- `getAll`, `getOne`: added org filter — `getOne` previously let anyone
  pull another organisation's tenant's full PII (ID number, emergency
  contact, tenancy/invoice history) by guessing a user ID.
- `create`: stamps `org_id` on both the new `users` and `tenants` rows
  (previously unset on both, silently defaulting to org 1).
- `update`: added org check + existence check (previously ran
  unconditionally against any user ID).

## Fixed: `tenancies.js`
- `getAll`: added org filter.
- `create`: **Guards 1 and 2 (tenant lookup, unit lookup) had no org
  check** — a user could create a tenancy pairing another organisation's
  tenant with another organisation's unit. Fixed both lookups; the new
  tenancy row and its deposit/first-month invoices now all get `org_id`
  stamped (previously unset on all three inserts).
- `terminate`: added org check (previously anyone could terminate — or
  reactivate — any tenancy in the system).
- `uploadLease`: added existence + org check — previously ran
  unconditionally with no check of any kind.

## Fixed: `tenancies_renew.js`
- `renew`: added org check — previously anyone could change the end
  date and rent amount on another organisation's lease.
- `getExpiring`: added org filter — previously listed expiring leases
  across every organisation on the platform.

## Fixed: `users.js`
The most dangerous file in the audit — every one of its 10 endpoints had
zero org check. Two stand out:
- `resetPassword` had **no ownership check of any kind** — any
  authenticated user, in any organisation, could reset the password of
  any other user in the entire system. A full account-takeover
  primitive. Now scoped, existence-checked, and revokes the target's
  existing sessions on reset (a password reset should invalidate old
  logins — this wasn't happening before either).
- `deleteUser` could delete another organisation's staff/tenant account
  outright, same root cause.

Also fixed the same way: `getOne`, `getAll` (+ its role-count query),
`create` (org_id now stamped on new users/tenants), `update` (both the
base-fields and identity-fields updates), `suspend`, `unsuspend`,
`uploadPhoto`, and `search` (previously returned tenant/unit matches
from every organisation).

## Fixed: `deposit_refund.js`
`deposit_refunds` has no `org_id` column of its own (missed by the
migration that added it elsewhere), so ownership here is verified via a
JOIN through the tenancy it belongs to.
- `getDepositSummary`, `createRefund`: added the tenancy org check —
  previously anyone could view or create a deposit-refund record
  (which credits money to a tenant ledger) against another
  organisation's tenancy.
- `markRefundPaid` had **no ownership check of any kind** — anyone
  could mark any deposit refund in the system as paid by ID. Fixed with
  a JOINed UPDATE that verifies the tenancy's `org_id` before applying.

---

## 🔴 Critical tier: complete
All seven files in the Critical priority group are now fixed:
`properties.js`, `invoices.js`, `payments.js`, `tenants.js`,
`tenancies.js`, `tenancies_renew.js`, `users.js`, `deposit_refund.js`
(8 files — the original estimate was 7, `properties.js` came from the
initial pass).

## 🟠 High tier: complete

**`units.js`**: org filter on `getAll`; `create` now verifies the target
property belongs to the caller's org before creating a unit under it
(previously unvalidated); `update` gained an org + existence check.

**`maintenance.js`**: org filter on `getAll` (+ its count query);
`create` now verifies the unit belongs to caller's org, and stamps
`org_id`. Also found and fixed a **pre-existing unrelated bug** here:
the emergency-alert code referenced a `property_id` variable that was
never destructured from `req.body`, so it was always `undefined` — the
property-manager notification lookup always failed silently, meaning
emergency/urgent maintenance alerts only ever reached super_admins, never
the actual property manager. Fixed to use `unit.property_id`. That same
lookup was also unscoped by org (would've notified super_admins from
every organisation) — fixed alongside it. `update` gained an org check.

**`maintenance_photos.js`**: `maintenance_photos` has no `org_id` column
of its own — scoped all three functions (`upload`, `getPhotos`,
`deletePhoto`) via a JOIN through the parent maintenance request.
`deletePhoto` previously had no check at all — anyone could delete any
uploaded photo (and its file on disk) in the system by ID.

**`expenses.js`**: org filter on `getAll`; `create` now verifies the
property belongs to caller's org, stamps `org_id`. `delete` and `update`
previously had **zero checks of any kind** — `delete` didn't even check
the expense existed — both fixed with existence + org checks.

**`vendors.js`**: org filter on `getAll`; `create` stamps `org_id`;
`update` gained an org + existence check; `getJobs` scoped via
`maintenance_requests.org_id`.

**`vendorInvoices.js`**: org filter on `getAll`; `create` now verifies
both `vendor_id` and `property_id` belong to caller's org (previously
could pair another org's vendor with another org's property); `approve`
and `markPaid` **both had zero ownership checks** — anyone could approve
or mark-paid another organisation's vendor invoice by ID. Both fixed.

**`documents.js`**: org filter on `getAll`; `upload` stamps `org_id`;
`delete` gained an org check — previously anyone could delete another
organisation's uploaded documents (leases, ID scans) including the file
on disk.

**`cases.js`**: org filter on `getAll`; `create` now validates an
explicitly-supplied `property_id`, stamps `org_id`, and — same bug
pattern as `maintenance.js` — the "notify managers" lookup was
platform-wide, not org-scoped; fixed. `update` gained an org +
existence check. `addComment` and `getComments`: `case_comments` has no
`org_id` column of its own, scoped via JOIN through the parent case.

**`vacate.js`**: `vacate_notices` has no `org_id` column of its own,
scoped via JOIN through the parent tenancy throughout. `create` now
verifies the tenancy belongs to caller's org before filing a notice
against it and flipping its status. `update` (acknowledge) previously
had **no ownership check of any kind** — fixed with a JOINed UPDATE.

## 🟡 Medium tier: complete

**`visitors.js`, `parking.js`, `securityLogbook.js`, `announcements.js`**:
already fixed in an earlier pass this session — verified complete on
review (org filters on list endpoints, org checks on check-in/out,
assign, and create/update paths).

**`messages.js`**: this one had real, substantive gaps.
- `send`: an explicitly-supplied `property_id` was never checked against
  the caller's org. Worse, **every fallback branch** used to pick a
  property when none was supplied — "first property in the system",
  "recipient's property", "any property" — queried with no org filter
  at all, meaning a broadcast could silently land against another
  organisation's property. All four fallback paths fixed. Also added a
  check that a direct-message recipient (`to_user_id`) belongs to the
  caller's org.
- `reply`, `getThread`: **no ownership check of any kind** — anyone
  could read or reply into any message thread in the entire system by
  ID. `messages` has no `org_id` column of its own, scoped via a JOIN
  through the parent property.
- `getStaff`'s `super_admin` branch had no org filter — returned every
  user across every organisation on the platform. Fixed.

**`notifications.js`**: reviewed, no changes needed — every query is
already scoped to `user_id=req.user.sub` (the caller's own notifications),
which is inherently safe regardless of an `org_id` column.

**`sharedMeters.js`**: `shared_meters` has no `org_id` column, scoped via
its property throughout.
- `getAll`: org filter added (a super_admin saw shared meters
  system-wide).
- `create`: verifies the property belongs to caller's org.
- `postReading`: **the most consequential fix in this tier** — this
  endpoint generates real invoices by splitting a utility bill across
  units. It had no ownership check on `meter_id` at all, meaning anyone
  could post a meter reading against another organisation's shared
  meter and generate real invoices against that org's tenancies. Fixed,
  and the generated invoices now get `org_id` stamped (previously unset).

**`utilities.js`**: same pattern — `utility_readings` has no `org_id`
column. `getAll` gained an org filter via the property join. `create`
now validates both `unit_id` and an explicit `tenancy_id` (the latter
also used to generate a real invoice) belong to caller's org, and
stamps `org_id` on the generated invoice.

## Full audit — remaining files, by priority
- 🟢 **Lower, not yet checked**: `accessLog.js`, `inspections.js`,
  `enterprise.js`, `ratings.js`
- ⚪ **Needs separate review**: `owner/properties.js`,
  `security/logbook.js`, `mpesaStk.js` (see Phase 0 for what's already
  hardened there)
- 🟠 **High**: `units.js`, `maintenance.js`, `maintenance_photos.js`,
  `expenses.js`, `vendors.js`, `vendorInvoices.js`, `documents.js`,
  `cases.js`, `vacate.js`
- 🟡 **Medium**: `visitors.js`, `parking.js`, `securityLogbook.js`,
  `announcements.js`, `messages.js`, `notifications.js`,
  `sharedMeters.js`, `utilities.js`
- 🟢 **Lower**: `accessLog.js`, `inspections.js`, `enterprise.js`,
  `ratings.js`
- ⚪ **Needs separate review** (different controller folders / different
  scoping mechanism, don't blindly copy the pattern): `owner/properties.js`,
  `security/logbook.js`, `mpesaStk.js`

For each file, the fix pattern is the same as `properties.js`: add
`org_id=?` to every by-ID SELECT/UPDATE/DELETE, and make sure every
INSERT explicitly sets `org_id` from `req.user.org_id` rather than
relying on the column default.

---

## What's still open

- **🔴 Critical, 🟠 High, and 🟡 Medium tiers of the org-isolation audit
  are done** (25 files). **🟢 Lower tier is next** (4 files:
  `accessLog.js`, `inspections.js`, `enterprise.js`, `ratings.js`), then
  the 3 files needing separate review (`owner/properties.js`,
  `security/logbook.js`, `mpesaStk.js`).
- Two incompatible cache implementations (`services/cache.js` vs
  `utils/cache.js`) — not touched yet.
- Migration system (loose SQL files + numbered JS migrations + the
  ad-hoc `ALTER TABLE` block in `server.js`) — not consolidated yet.
- Login rate-limiting is still IP-only, not IP+account.
- No new automated tests (IDOR, duplicate-webhook, forged-callback,
  refresh-token-cookie, org-isolation regression) added yet.

Happy to work through any of these next — just say which.
