# Smart Nyumba Pro — Full Bug Fix & Enhancement Patch Notes

---

## 🔴 Critical Bug Fixes

---

### FIX 1 — Shared Meters: "Route not found POST /api/sharedmeter"
**Files changed:** `frontend/src/pages/admin/SharedMeters.jsx`

**Root cause:** The frontend was calling `/api/shared-meters` (with a hyphen) but the backend registers the route as `/api/sharedMeters` (camelCase). This caused a 404 "route not found" on every GET, POST, and reading POST.

**What was fixed:**
- `api.get('/shared-meters')` → `api.get('/sharedMeters')`
- `api.post('/shared-meters', ...)` → `api.post('/sharedMeters', ...)`
- `api.post('/shared-meters/reading', ...)` → `api.post('/sharedMeters/reading', ...)`

> The manager SharedMeters page re-exports the admin component, so it is automatically fixed too.

---

### FIX 2 — Settings: M-Pesa STK Push toggle keeps turning off
**Files changed:**
- `frontend/src/pages/admin/Settings.jsx`
- `backend/controllers/admin/settings.js`

**Root cause (frontend):** The toggle only updated local React state. It required clicking "Save all settings" to actually persist. Users toggled it on, navigated away, and it reverted.

**Root cause (backend):** The `UPDATE` SQL only works if the key already exists in the `settings` table. If `mpesa_stk_enabled` was never inserted, the UPDATE silently affected 0 rows — so the setting was never saved.

**What was fixed:**
- Toggle now **auto-saves immediately** on click via a direct `updateSettings({ [key]: newVal })` API call — no manual save needed.
- Backend now uses `INSERT ... ON DUPLICATE KEY UPDATE` (upsert) so settings are always created or updated correctly.

---

### FIX 3 — Tenant Portal: "No active tenancy" / Statement, Invoices, Maintenance all broken
**Files changed:** `backend/routes/tenancies.js`

**Root cause:** The auth context calls `getMyTenancy()` which hits `GET /api/tenancies/my`. **This route did not exist** in the backend. The request silently returned 404, so `profile.tenancy_id`, `profile.unit_id`, and `profile.property_id` were always `undefined` for tenants. This caused:
- Statement → "No active tenancy found"
- Invoices → "No active tenancy"
- Maintenance → "No unit found. Contact your manager." (submit blocked)
- Cases → submit blocked

**What was fixed:** Added `GET /api/tenancies/my` route that:
- Is scoped to `role: tenant` only
- Accepts tenancy statuses `active`, `approved`, or `pending`
- Returns full tenancy info including unit, property, and manager contact details

---

### FIX 4 — Tenant Announcements: "Tenancy not found" when sending message to staff
**Files changed:** `backend/controllers/admin/messages.js`

**Root cause:** The messages `send` controller looked up the tenant's property using `WHERE ten.status = 'active'`. Tenancies with status `'pending'` or `'approved'` were not found, so `property_id` resolved to null and the error "property_id required" was returned.

**What was fixed:** Changed status filter to `IN ('active', 'approved', 'pending')`.

---

### FIX 5 — Auth `/me` endpoint: Tenant profile blank for non-'active' tenancies
**Files changed:** `backend/controllers/auth/index.js`

**Root cause:** The `/auth/me` endpoint (which loads on every login/refresh) used `WHERE ten.status='active'` in two places. Tenants with `pending` or `approved` status got no profile data at all.

**What was fixed:** Both occurrences changed to `IN ('active', 'approved', 'pending')`.

---

### FIX 6 — Visitor Check-In: All units shown, not filtered by property
**Files changed:**
- `frontend/src/pages/admin/Visitors.jsx`
- `frontend/src/pages/security/CheckIn.jsx`

**Root cause:** Unit options were built from all units regardless of the selected property. A security guard or admin selecting "Sunrise Apartments" would still see units from all other properties.

**What was fixed:**
- Units are now filtered: `(units||[]).filter(u => !form.property_id || String(u.property_id) === String(form.property_id))`
- Selecting a new property also **resets unit_id** so stale selection doesn't carry over.
- The manager Visitors page re-exports admin, so it is automatically fixed.

---

### FIX 7 — Tenant Statement: `/reports/statement/:id` endpoint missing
**Files changed:** `backend/routes/reports.js`, `backend/routes/pdf.js`

**Root cause:** The tenant Statement page called `GET /api/reports/statement/:tenancy_id` but this endpoint was never registered. The request returned 404.

**What was fixed:**
- Added `GET /api/reports/statement/:tenancy_id` route with proper tenant-scoping security check.
- Returns tenancy details, full debit/credit ledger with running balance, and totals.
- Added `GET /api/pdf/statement/:tenancy_id` PDF download route.

---

### FIX 8 — Tenant Maintenance: Requests not being saved
**Root cause:** Same as FIX 3. `p.unit_id` was `undefined` because `/tenancies/my` route was missing, so the submit guard `if (!p.unit_id) return toast.error(...)` always blocked submission.

**Fix:** Resolved by FIX 3 (adding the `/tenancies/my` route).

---

### FIX 9 — Tenant Create: Password required / poor UX
**Files changed:**
- `backend/controllers/admin/tenants.js`
- `frontend/src/pages/admin/Tenants.jsx`

**Root cause:** Password was a required field, meaning admins had to manually type and remember/share passwords. No email notification was sent.

**What was fixed:**
- **Password is now optional** — if omitted, a secure random password is auto-generated.
- A **welcome email** is sent to the tenant with their login credentials (non-fatal if email service is not configured).
- The frontend shows a **"Copy password" screen** after creation displaying the auto-generated password, with a one-time warning that it won't be shown again.
- Email is now a **required field** (needed to send credentials and for login).

---

### FIX 10 — Tenancy Create: Form not fully resetting (wrong tenant selected)
**Files changed:** `frontend/src/pages/admin/Tenancies.jsx`

**Root cause:** React's state batching could sometimes cause the modal to re-open with stale `tenant_id` from the previous session.

**What was fixed:** Added a `key` prop to the Modal that changes between open/closed states, forcing a full remount and clean state reset every time the create modal opens.

---

### FIX 11 — Security Logbook: property_id guard with user feedback
**Files changed:** `frontend/src/pages/security/Logbook.jsx`

**Root cause:** Security guards without a `property_id` assigned would get an opaque backend error.

**What was fixed:** Added a pre-check — if the security guard has no `property_id`, they now see a clear toast: *"Your account has no property assigned. Contact your administrator."*

---

### FIX 12 — Announcements controller: status filter fix
**Files changed:** `backend/controllers/admin/announcements.js`

**Root cause:** Same `status='active'` issue — tenants with non-active tenancy statuses couldn't receive announcements.

**Fix:** Changed to `IN ('active', 'approved', 'pending')`.

---

## 🟡 Owner Portal Enhancements

**Problem:** The owner portal only had Dashboard and Remittances. Owners had no visibility into their properties' day-to-day operations.

**New pages added:**

### `GET /owner/properties` → `/owner/properties`
Full property cards with occupancy rate bar, unit breakdown, manager contact details.

### `GET /owner/units` → `/owner/units`
All units across all owned properties with tenant name, phone, rent, lease dates, and status filter tabs.

### `GET /owner/maintenance` → `/owner/maintenance`
All maintenance requests across owned properties with priority, status, category, and assigned staff.

### `GET /owner/invoices` → `/owner/invoices`
All invoices with totals (invoiced / collected / outstanding) and filter by status.

### `GET /owner/expenses` → `/owner/expenses`
All expenses with breakdown by category chart and monthly totals.

**Sidebar updated** with sections: Overview → Portfolio → Financials → Operations → Account.

---

## 🆕 New: Tenant Cases Page

**Problem:** The sidebar showed "My Cases" for tenants but no page or route existed.

**Files added:** `frontend/src/pages/tenant/Cases.jsx`
**Files changed:** `frontend/src/App.jsx` (route added)

Features:
- Submit cases with category, priority, and description
- View open vs resolved cases with status badges
- Shows clear warning if no tenancy is active
- Sends case to property management team

---

## Summary Table

| # | Area | Bug | Fix type |
|---|------|-----|----------|
| 1 | Shared Meters | Route URL case mismatch (404) | Frontend URL fix |
| 2 | Settings | STK toggle resets on reload | Auto-save + backend upsert |
| 3 | Tenant Portal | `/tenancies/my` route missing (all tenant features broken) | New backend route |
| 4 | Tenant Messages | Tenancy not found (status filter) | Backend SQL fix |
| 5 | Auth `/me` | Tenant profile empty for pending tenancies | Backend SQL fix |
| 6 | Visitor Check-In | All units shown, not filtered by property | Frontend filter fix |
| 7 | Tenant Statement | `/reports/statement/:id` endpoint missing | New backend route |
| 8 | Tenant Maintenance | Blocked by missing unit_id (from Fix 3) | Resolved via Fix 3 |
| 9 | Tenant Create | Password required, no email sent | Backend + Frontend UX |
| 10 | Tenancy Create | Stale tenant in form on re-open | Modal key remount fix |
| 11 | Security Logbook | Silent failure, no property assigned | Frontend guard + toast |
| 12 | Announcements | Tenant not found (status filter) | Backend SQL fix |
| 13 | Owner Portal | Only 2 pages, no operational visibility | 5 new pages + 5 API routes |
| 14 | Tenant Cases | Page missing, sidebar link broken | New page + route |

---

## How to Apply

1. Extract the `smartnyumba_fixed.7z` archive.
2. Copy the `backend/` folder contents into your backend project (replace existing files).
3. Copy the `frontend/src/` folder contents into your frontend project (replace existing files).
4. Restart the backend: `node server.js` or `pm2 restart all`.
5. Rebuild frontend: `npm run build`.

> No database migrations are required for these fixes. All changes are in application code only.
