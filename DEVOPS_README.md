# SmartNyumba Pro — DevOps / Root Package

## What's in this zip
Root-level files that live alongside (not inside) frontend/ and backend/.

## Extraction
```bash
# From your project root
unzip -o devops.zip
```

## Contents
- `docker-compose.yml`        — MySQL + backend + nginx frontend + Adminer (dev profile)
- `playwright.config.js`      — E2E test runner config
- `package.json`              — root package with test:e2e / test:unit / test:all scripts
- `.github/workflows/`        — backend-ci.yml + frontend-ci.yml (now in the right place)
- `e2e/critical-path.spec.js` — 34 E2E tests: auth, role isolation, payment flow, API contracts

## Running E2E tests
```bash
# Install Playwright browsers once
npx playwright install chromium

# Start servers then run tests
npm run test:e2e
```

## Running with Docker
```bash
docker compose up -d                          # start everything
docker compose --profile dev up -d            # include Adminer on :8080
docker compose logs -f backend                # watch API logs
```
