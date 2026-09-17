# SmartNyumba Pro — Frontend Drop-in Package

## What's in this zip
This zip replaces the contents of your `frontend/` folder.
Extract it and the folder structure will match your existing project exactly.

## Extraction
```bash
# From your project root (the folder containing frontend/ and backend/)
unzip -o frontend.zip
```

## After extraction — run once
```bash
cd frontend
npm install        # pick up any new deps (none added, but safe to run)
npm run dev        # start dev server
```

## Key changes in this package
- New design system: Fraunces/Outfit/JetBrains Mono fonts, amber brand, CSS custom properties
- New Sidebar (obsidian, SVG icons), Topbar (Fraunces title), KpiCard (italic serif numbers)
- Role-based UI guards via `src/utils/roleGuard.js`
- All 90 pages migrated off slate Tailwind tokens onto CSS vars
- New dashboards: Admin, Manager, Owner, Tenant, Caretaker, Security
- New Login page (split panel, OTP step)
- New Reports page (8 tabs including P&L, cashflow, occupancy, rent roll)
- Dockerfile + nginx.conf (2-stage build for production)

## Files that are NEW (no previous counterpart)
- `src/utils/roleGuard.js`
- `Dockerfile`
- `nginx.conf`
