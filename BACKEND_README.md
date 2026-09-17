# SmartNyumba Pro — Backend Drop-in Package

## What's in this zip
This zip replaces the contents of your `backend/` folder.
Extract it and the folder structure will match your existing project exactly.

## Extraction
```bash
# From your project root
unzip -o backend.zip
```

## After extraction
```bash
cd backend
cp .env.example .env       # if you don't have a .env yet
# Edit .env with your DB, M-Pesa, SMTP credentials
node server.js
```

## ⚠️ IMPORTANT — Rotate secrets after extraction
The `.env` in this package has NEW rotated secrets.
All existing JWTs will be invalid after replacing — users will need to re-login once.

## Key changes in this package
- `controllers/admin/invoices.js` — bulkGenerate wrapped in transaction; correlated subquery → derived JOIN
- `scripts/cron.js` — SaaS cron jobs moved inside start() (Fix #4)
- `routes/reports.js` — now calls reports_enhanced controller for better P&L/forecast/maintenance KPIs
- `scripts/dev/fix_passwords.js` + `reset_admin.js` — moved here from root, production-guarded

## Files DELETED from root
- `fix_passwords.js` → now at `scripts/dev/fix_passwords.js`
- `reset_admin.js`   → now at `scripts/dev/reset_admin.js`
