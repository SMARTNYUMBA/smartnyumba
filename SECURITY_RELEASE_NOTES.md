# Smart Nyumba Pro — Security Release Notes

This source release has been cleaned and hardened for deployment preparation.

## Changes
- Removed bundled `.env` and staging secrets. Use environment variables or a secret manager.
- Removed `.git`, `node_modules`, runtime logs, uploads, build output and backup archives.
- Enforced organization/property scoping on schedules and security logbook operations.
- Removed JWT authentication via PDF query-string tokens. Use Authorization headers / normal authenticated browser sessions.
- Removed the login organization fail-open fallback to organization 1.
- Hardened production database TLS verification.
- Migration runner now stops on migration failure.
- Added schedule organization-scope migration.
- Removed duplicate migration files and duplicate Docker Compose copies.
- Fixed production Dockerfile naming and removed the missing migration_v7_enterprise.sql mount.
- Fixed CI database password variable name and Playwright dependency installation.
- Standardized many backend 500-error responses to use `safeErr`.

## Before production
1. Generate fresh production secrets for JWT, encryption, database, webhooks, cron and integrations.
2. Set `DB_SSL=true` and provide `DB_SSL_CA` when your database provider requires a custom CA.
3. Run backend migrations against a staging database first.
4. Run a clean `npm ci` in both `backend/` and `frontend/`.
5. Run unit tests, frontend build and E2E tests.
6. Review remaining authorization/business rules against your exact tenant/property model.
