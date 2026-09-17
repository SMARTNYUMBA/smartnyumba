// Smart Nyumba Pro — Setup Script
// Run: node scripts/setup.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('../config/db');

const DEMO_USERS = [
  { email: 'admin@smartnyumba.com',     password: 'Admin@123',   role: 'super_admin' },
  { email: 'manager@smartnyumba.com',   password: 'Manager@123', role: 'property_manager' },
  { email: 'alice@smartnyumba.com',     password: 'Tenant@123',  role: 'tenant' },
  { email: 'bob@smartnyumba.com',       password: 'Tenant@123',  role: 'tenant' },
  { email: 'carol@smartnyumba.com',     password: 'Tenant@123',  role: 'tenant' },
  { email: 'caretaker@smartnyumba.com', password: 'Staff@123',   role: 'caretaker' },
  { email: 'security@smartnyumba.com',  password: 'Staff@123',   role: 'security' },
];

async function setup() {
  console.log('\n🔧 Smart Nyumba Pro — Setup\n');
  let ok = 0, fail = 0;

  for (const u of DEMO_USERS) {
    try {
      const hash = await bcrypt.hash(u.password, 12);
      const [r] = await pool.query(
        'UPDATE users SET password_hash=? WHERE email=?', [hash, u.email]
      );
      if (r.affectedRows) {
        console.log(`  ✅  ${u.email}  →  ${u.password}`);
        ok++;
      } else {
        console.log(`  ⚠️  ${u.email}  — not found (run seed.sql first)`);
        fail++;
      }
    } catch (e) {
      console.log(`  ❌  ${u.email}  — ${e.message}`);
      fail++;
    }
  }

  console.log(`\n  ✅  ${ok} passwords set   ❌  ${fail} failed`);
  console.log('\n  Demo credentials:');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  for (const u of DEMO_USERS)
    console.log(`  │  ${u.role.padEnd(18)} ${u.email.padEnd(32)} ${u.password}`);
  console.log('  └─────────────────────────────────────────────────────────────┘\n');

  process.exit(0);
}

setup().catch(e => { console.error('Setup failed:', e.message); process.exit(1); });
