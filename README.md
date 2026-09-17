# Smart Nyumba Pro — Complete Setup Guide
## Commercial Property Management System

---

## 📁 WHAT YOU HAVE

```
smartnyumba_pro/
├── backend/              ← Node.js + Express API (Port 3000)
│   ├── server.js         ← Entry point
│   ├── app.js            ← Routes & middleware
│   ├── .env              ← Your configuration (edit this!)
│   ├── config/db.js      ← MySQL connection
│   ├── controllers/      ← Business logic (18 controllers)
│   ├── routes/           ← API endpoints (21 route files)
│   ├── services/         ← M-Pesa, SMS, PDF
│   ├── middleware/auth.js ← JWT protection
│   ├── scripts/
│   │   ├── setup.js      ← Hash demo passwords (run once)
│   │   └── cron.js       ← Auto billing & overdue marking
│   └── utils/helpers.js  ← Utilities
│
├── frontend/             ← React 18 + Vite + TailwindCSS (Port 5173)
│   ├── src/
│   │   ├── App.jsx        ← All routes & navigation
│   │   ├── api.js         ← All API calls
│   │   ├── pages/         ← 5 role portals (50+ pages)
│   │   ├── components/    ← Reusable UI components
│   │   └── context/       ← Auth state
│   └── index.html
│
└── database/
    ├── schema.sql        ← 25 tables (run this first)
    └── seed.sql          ← Demo data
```

---

## ⚡ QUICK START (Windows + XAMPP)

### STEP 1 — Set up the database

1. Start XAMPP → Start **Apache** and **MySQL**
2. Open XAMPP Shell (or `cmd` in `C:\xampp\mysql\bin\`)
3. Run:

```bash
mysql -u root
```

```sql
CREATE DATABASE smartnyumba CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smartnyumba;
SOURCE C:/Users/YOUR_USERNAME/Desktop/smartnyumba_pro/database/schema.sql;
SOURCE C:/Users/YOUR_USERNAME/Desktop/smartnyumba_pro/database/seed.sql;
EXIT;
```

> ⚠️ Replace `YOUR_USERNAME` with your Windows username.

---

### STEP 2 — Configure the backend

Edit `backend/.env`:

```env
DB_HOST=127.0.0.1          ← Must be 127.0.0.1, NOT localhost
DB_PORT=3306
DB_NAME=smartnyumba
DB_USER=root
DB_PASSWORD=               ← Leave blank for default XAMPP
JWT_SECRET=change_this_to_a_random_secret_string
```

---

### STEP 3 — Install & start backend

Open **Command Prompt / PowerShell** window:

```powershell
cd C:\Users\YOUR_USERNAME\Desktop\smartnyumba_pro\backend
npm install
node scripts/setup.js       ← Hashes demo passwords (run ONCE)
node server.js
```

✅ You should see:
```
╔══════════════════════════════════════════╗
║     🏠  Smart Nyumba Pro  v1.0.0         ║
║     🚀  Server running on port 3000      ║
╚══════════════════════════════════════════╝
✅ Database connected
```

---

### STEP 4 — Install & start frontend

Open a **second** Command Prompt window:

```powershell
cd C:\Users\YOUR_USERNAME\Desktop\smartnyumba_pro\frontend
npm install
npm run dev
```

✅ You should see:
```
VITE v5.x.x  ready in 500ms
➜  Local:   http://localhost:5173/
```

---

### STEP 5 — Open the app

Visit: **http://localhost:5173**

---

## 🔑 DEMO ACCOUNTS

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Super Admin | admin@smartnyumba.com | Admin@123 | Full system |
| Property Manager | manager@smartnyumba.com | Manager@123 | Properties & billing |
| Tenant (Alice) | alice@smartnyumba.com | Tenant@123 | Unit A1, Westlands |
| Tenant (Bob) | bob@smartnyumba.com | Tenant@123 | Unit A2, Westlands |
| Tenant (Carol) | carol@smartnyumba.com | Tenant@123 | Unit C1, Kilimani |
| Caretaker | caretaker@smartnyumba.com | Staff@123 | Tasks & utilities |
| Security | security@smartnyumba.com | Staff@123 | Visitors & parking |

---

## 🔄 EVERY TIME YOU START

1. Open XAMPP → Start **MySQL** (green light ✅)
2. **Window 1** — Backend:
   ```powershell
   cd backend
   node server.js
   ```
3. **Window 2** — Frontend:
   ```powershell
   cd frontend
   npm run dev
   ```
4. Visit **http://localhost:5173**

---

## 💳 M-PESA INTEGRATION

### Get Daraja credentials:
1. Go to **developer.safaricom.co.ke**
2. Create an account → Create app
3. Enable **Lipa na M-Pesa Online** API
4. Copy Consumer Key, Consumer Secret, and Passkey

### Configure in `.env`:
```env
MPESA_ENV=sandbox               ← Change to 'production' when live
MPESA_CONSUMER_KEY=xxxxxx
MPESA_CONSUMER_SECRET=xxxxxx
MPESA_SHORTCODE=174379          ← Use your actual shortcode
MPESA_PASSKEY=xxxxxx
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback
```

### Enable in Settings:
- Login as Admin → Settings → Toggle **M-Pesa payments** ON

> ⚠️ For testing, the sandbox uses shortcode **174379** and passkey from Daraja docs.
> For the callback URL in sandbox, use [ngrok](https://ngrok.com) to expose localhost.

---

## 📱 SMS INTEGRATION (Africa's Talking)

1. Register at **account.africastalking.com**
2. Create an app, get API Key
3. Add a Sender ID (optional, needs AT approval)

### Configure in `.env`:
```env
AT_USERNAME=sandbox            ← Your AT username
AT_API_KEY=your_api_key
AT_SENDER_ID=SmartNyumba
```

### Enable in Settings:
- Login as Admin → Settings → Toggle **SMS notifications** ON

### Available SMS actions:
- Auto payment reminders (via API: `POST /api/sms/reminders`)
- Payment receipt SMS (auto on payment record)
- Welcome SMS on tenant creation

---

## 📄 PDF RECEIPTS

Receipts are generated automatically when a payment is recorded.

To download a receipt:
```
GET /api/pdf/receipt/:payment_id
Authorization: Bearer <token>
```

Or add a download button in the frontend (see payments page).

---

## 🏗️ SYSTEM FEATURES

### ✅ Admin / Manager Portal
- **Dashboard** — KPIs, revenue chart, arrears table, property stats
- **Properties** — Create/edit properties, assign managers
- **Units** — Add units, track occupancy, floor/type management
- **Tenants** — Full tenant profiles, ID, vehicle, emergency contacts
- **Tenancies** — Create leases, terminate, track status
- **Invoices** — Single & bulk generation, overdue marking
- **Payments** — Record payments, auto-receipt, M-Pesa integration
- **Expenses** — Property expenses by category with vendor tracking
- **Reports** — Income statement, 6-month trend, arrears report
- **Maintenance** — Ticket system, priority, assignment, notes
- **Visitors** — Check-in/out log, vehicle registration
- **Parking** — Visual grid, click-to-cycle status, allocation
- **Utilities** — Meter readings (water/electricity), auto-invoice
- **Announcements** — Property-targeted or broadcast messages
- **Vacate notices** — Track and acknowledge tenant exit notices
- **Users** — Manage all users, reset passwords
- **Settings** — M-Pesa, SMS, late fees, billing rules

### ✅ Tenant Portal
- Dashboard with outstanding balance summary
- Invoice list with pay now button
- Payment submission (M-Pesa reference entry)
- Maintenance request submission
- Visitor pre-registration
- Vacate notice submission
- Profile & tenancy details
- Announcements feed

### ✅ Caretaker Portal
- My assigned maintenance tasks
- Post utility meter readings (auto-invoice option)
- View occupied units and tenant info

### ✅ Security Portal
- Real-time visitor check-in / check-out
- Live "on premises" board (auto-refreshes every 30s)
- Parking slot status view
- Raise security alerts to management

---

## 🗃️ DATABASE STRUCTURE

| Table | Description |
|-------|-------------|
| users | All system users |
| properties | Estate properties |
| units | Individual units |
| tenancies | Active/past leases |
| tenants | Tenant profiles |
| invoices | All billing |
| payments | Payment records |
| receipts | Receipt numbers |
| tenant_ledger | Running balance |
| mpesa_transactions | STK push tracking |
| expenses | Property costs |
| maintenance_requests | Work tickets |
| visitors | Visitor log |
| parking_slots | Parking spaces |
| parking_allocations | Slot assignments |
| utility_readings | Meter readings |
| announcements | Notices |
| vacate_notices | Exit notices |
| system_alerts | Security alerts |
| sms_logs | SMS audit |
| settings | System config |
| audit_logs | Action tracking |

---

## 🌐 API ENDPOINTS REFERENCE

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/refresh | Refresh token |
| GET | /api/dashboard | Dashboard stats |
| GET | /api/properties | List properties |
| POST | /api/properties | Create property |
| GET | /api/units | List units |
| POST | /api/units | Create unit |
| GET | /api/tenants | List tenants |
| POST | /api/tenants | Create tenant |
| GET | /api/tenancies | List tenancies |
| POST | /api/tenancies | Create tenancy |
| GET | /api/invoices | List invoices |
| POST | /api/invoices | Create invoice |
| POST | /api/invoices/bulk | Bulk generate |
| GET | /api/payments | List payments |
| POST | /api/payments | Record payment |
| GET | /api/maintenance | List requests |
| POST | /api/maintenance | New request |
| PUT | /api/maintenance/:id | Update request |
| GET | /api/visitors | Visitor log |
| POST | /api/visitors | Check in |
| PUT | /api/visitors/:id/out | Check out |
| GET | /api/parking | Parking slots |
| GET | /api/reports/financial | Financial report |
| GET | /api/utilities | Meter readings |
| POST | /api/utilities | Post reading |
| POST | /api/mpesa/stk | Initiate M-Pesa |
| POST | /api/mpesa/callback | M-Pesa webhook |
| GET | /api/pdf/receipt/:id | Download receipt |
| POST | /api/sms/reminders | Send bulk reminders |
| GET | /api/settings | System settings |
| PUT | /api/settings | Update settings |

---

## 🚀 GOING LIVE (Production)

### Option 1 — DigitalOcean Droplet (Recommended, ~$12/mo)
1. Create Ubuntu 22.04 droplet
2. Install Node.js 20, MySQL 8, Nginx
3. Clone/upload project
4. Set production `.env`
5. Use PM2: `pm2 start server.js --name smartnyumba`
6. Build frontend: `npm run build` → serve with Nginx
7. Get SSL: `certbot --nginx -d yourdomain.com`

### Option 2 — Railway / Render (Free tier)
1. Push to GitHub
2. Connect repo to Railway/Render
3. Set environment variables in dashboard
4. Database: Use Railway MySQL plugin or PlanetScale

### Nginx config (example):
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Frontend
    location / {
        root /var/www/smartnyumba/frontend/dist;
        try_files $uri /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

---

## 🛟 TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED` on DB | Start XAMPP MySQL. Use `127.0.0.1` not `localhost` |
| `Invalid token` errors | Re-run `node scripts/setup.js` after seeding |
| Frontend shows blank | Check `npm run dev` is running and no JS errors in console |
| M-Pesa callback not hitting | Use ngrok in sandbox: `ngrok http 3000` |
| SMS not sending | Check AT_USERNAME and AT_API_KEY in `.env`, enable in Settings |
| Port 3000 in use | Change `PORT=3001` in `.env` and update `vite.config.js` proxy |
| `Cannot GET /api/...` | Ensure backend is running with `node server.js` |

---

## 🧰 TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, React Query, Recharts |
| Backend | Node.js, Express, JWT auth |
| Database | MySQL (XAMPP locally, managed MySQL in production) |
| Payments | M-Pesa Daraja API (STK Push) |
| SMS | Africa's Talking |
| PDF | PDFKit |
| Scheduling | node-cron |

---

*Smart Nyumba Pro v1.0.0 — Built for Kenyan property managers*
