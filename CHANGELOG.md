# SmartNyumba Pro — Changelog

All notable changes are documented here.
Format: [Version] — Date — Summary

---

## [2.1.0] — 2026-04 — Enterprise Security & SaaS Edition

### Security
- Removed `unsafe-inline` from Content Security Policy script sources
- Settings API now enforces a strict allowlist of 40 valid keys
- Access token moved to memory-only (never localStorage) — XSS-proof
- Refresh token migrated to sessionStorage with HttpOnly cookie support in production
- Property managers now scoped to their own property in user lists
- PDF download endpoints rate-limited (20 requests/minute/user)
- M-Pesa receipt number generation locked inside DB transaction — race condition fixed
- Announcement and notes fields sanitized on write to prevent stored XSS
- All refresh tokens invalidated on password change and reset
- M-Pesa callback endpoint now enforces Safaricom IP allowlist in production
- Search input escaped for LIKE special characters, capped at 100 chars
- Per-user rate limiting added for authenticated endpoints

### New Features
- **Email-based password reset** — signed token link, 1-hour expiry, no SMS required
- **Tenant self-registration** — property invite links, admin approval workflow
- **Outbound webhooks** — subscribe to payment, invoice, tenant, and maintenance events
- **GDPR/DPA 2019 data export** — `GET /api/auth/export-data` returns all personal data as JSON
- **PWA** — installable app, offline queue for security check-ins and meter readings
- **API versioning** — all routes available under `/api/v1/`
- **Owner remittance emails** — automated monthly PDF summaries to property owners
- **Onboarding detection** — fresh installs redirected to setup wizard
- **S3-compatible storage** — switch from local disk to AWS S3/Cloudflare R2 via env var
- **Structured error codes** — every API error includes a machine-readable `code` field

### Data & Performance
- 30+ database indexes auto-applied at startup
- User deletion converted to soft delete with PII anonymization (GDPR-compatible)
- Bulk operations capped (500 rows import, 2000 tenancy invoice guard)
- Pagination added to payments, tenancies, and users endpoints
- DB connection pool: `queueLimit: 50`, pool exhaustion warning events
- Health metrics endpoint `GET /api/health/metrics` (super_admin)

### Infrastructure
- `.gitignore` added — `.env` and uploads excluded
- `docker-compose.yml` moved to project root with nginx config
- Migration version tracking table (`_migrations`)
- Cron: monthly invoice day logged at startup, owner remittance job added
- `package.json`: granular test scripts (`test:auth`, `test:payments`, `test:cron`)

### Frontend
- ForgotPassword: SMS OTP + Email link tabs
- `/reset-password?token=...` route and page with password strength meter
- Pagination component wired into Payments, Tenancies, Users
- Modal: proper focus trap (Tab/Shift+Tab), `aria-labelledby`, focus restoration on close
- Service worker: offline queue, push notifications, background sync

### Bug Fixes
- Double `conn.commit()` crash in payment recording (critical)
- `auditMiddleware` was silently undefined in routes (named export missing)
- Receipt number race condition under concurrent payments
- Tenant data leak: `GET /api/payments` was unscoped for tenant role
- STK simulation DEMO_/SIM_ prefix mismatch
- Management fee hardcoded to 0 in P&L reports
- `migrateExpenses()` and other sub-migrations were never called
- Routes registered after `module.exports = app` in app.js

---

## [2.0.0] — 2026-01 — Initial Enterprise Release

- Multi-role system: super_admin, property_manager, caretaker, security, owner, tenant
- M-Pesa STK Push integration (Safaricom Daraja API)
- Automated cron: overdue marking, late fees, monthly invoices, lease expiry alerts
- PDF generation: receipts, invoices, tenant statements, remittances
- SMS (Africa's Talking) + WhatsApp notifications
- MFA via SMS OTP
- Maintenance request tracking with photo uploads
- Security logbook, visitor management, parking management
- Shared meter readings and service charge generation
- Tenant cases, announcements, documents, ratings
- Owner portal with property income dashboard
- Bulk tenant import (CSV)
- Audit log, access log, cron logs
- Docker: multi-stage build, non-root user, health checks

---
