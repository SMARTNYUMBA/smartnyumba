// Smart Nyumba Pro — Rich Demo Data Seed
// Run: node scripts/seed_demo.js
//
// Works WITH your existing seed.sql data.
// Adds: 6-month payment history, more tenants & tenancies,
//       maintenance requests, visitors, and expenses.
//
// Safe to run multiple times — each section checks before inserting.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('../config/db');

// ── Helpers ───────────────────────────────────────────────────
const pad  = n => String(n).padStart(2, '0');
const rInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function monthDate(monthsBack, day = 1) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack, day);
  return d.toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function sqlDT(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 19).replace('T', ' ');
}
function mpesaCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  return Array.from({ length: 10 }, () => c[rInt(0, c.length - 1)]).join('');
}

// ── Main ──────────────────────────────────────────────────────
async function run() {
  console.log('\n🌱  Smart Nyumba Pro — Rich Demo Seed\n');

  // 1. Verify base data exists
  const [[{ propCount }]] = await pool.query('SELECT COUNT(*) AS propCount FROM properties');
  if (parseInt(propCount) === 0) {
    console.error('❌  No properties found. Run seed.sql first via phpMyAdmin/MySQL CLI, then retry.');
    process.exit(1);
  }

  const [properties] = await pool.query('SELECT id, name FROM properties ORDER BY id');
  const [allUnits]   = await pool.query(
    'SELECT id, property_id, unit_number, type, rent_amount, deposit_amount, status FROM units ORDER BY id');
  const [[admin]]    = await pool.query("SELECT id FROM users WHERE role='super_admin' LIMIT 1");

  console.log(`  ✅  ${properties.length} properties: ${properties.map(p => p.name).join(' | ')}`);
  console.log(`  ✅  ${allUnits.length} units found`);

  // 2. Add extra tenant users
  const EXTRA = [
    { full_name: 'Faith Njeri',    email: 'faith@demo.co.ke',   phone: '0712345601' },
    { full_name: 'Kevin Ochieng',  email: 'kevin@demo.co.ke',   phone: '0723456702' },
    { full_name: 'Lucy Wambua',    email: 'lucy@demo.co.ke',    phone: '0734567803' },
    { full_name: 'Moses Kamau',    email: 'moses@demo.co.ke',   phone: '0745678904' },
    { full_name: 'Tabitha Chebet', email: 'tabitha@demo.co.ke', phone: '0756789005' },
    { full_name: 'Victor Mutwa',   email: 'victor@demo.co.ke',  phone: '0767890106' },
    { full_name: 'Rose Mwangi',    email: 'rose@demo.co.ke',    phone: '0778901207' },
    { full_name: 'Dennis Otieno',  email: 'dennis@demo.co.ke',  phone: '0789012308' },
  ];
  let addedTenants = 0;
  for (const t of EXTRA) {
    const [[ex]] = await pool.query('SELECT id FROM users WHERE email=?', [t.email]);
    if (!ex) {
      const hash = await bcrypt.hash('Tenant@123', 10);
      const [ur] = await pool.query(
        "INSERT INTO users (full_name,email,phone,password_hash,role,is_active) VALUES (?,?,?,?,'tenant',1)",
        [t.full_name, t.email, t.phone, hash]);
      await pool.query(
        'INSERT INTO tenants (user_id,id_number) VALUES (?,?)',
        [ur.insertId, `ID${rInt(10000000, 39999999)}`]);
      addedTenants++;
    }
  }
  if (addedTenants) console.log(`  ✅  Added ${addedTenants} extra tenant users`);

  // 3. Fetch all tenants
  const [tenants] = await pool.query(
    `SELECT t.id AS tenant_id, u.id AS user_id, u.full_name, u.phone
     FROM tenants t JOIN users u ON t.user_id=u.id ORDER BY t.id`);

  // 4. Create tenancies for currently vacant units
  const [existingTen] = await pool.query("SELECT unit_id FROM tenancies WHERE status='active'");
  const takenUnitIds  = new Set(existingTen.map(r => r.unit_id));
  const vacantUnits   = allUnits.filter(u => !takenUnitIds.has(u.id));

  let tenantIdx = 3; // first 3 tenants already placed by seed.sql
  let newTenancies = 0;
  for (const unit of vacantUnits) {
    if (tenantIdx >= tenants.length) break;
    const tenant  = tenants[tenantIdx++];
    const start   = monthDate(rInt(3, 12));
    const deposit = unit.deposit_amount || unit.rent_amount * 2;
    await pool.query(
      'INSERT INTO tenancies (tenant_id,unit_id,start_date,rent_amount,deposit,status) VALUES (?,?,?,?,?,?)',
      [tenant.tenant_id, unit.id, start, unit.rent_amount, deposit, 'active']);
    await pool.query("UPDATE units SET status='occupied' WHERE id=?", [unit.id]);
    newTenancies++;
  }
  if (newTenancies) console.log(`  ✅  Created ${newTenancies} new tenancies`);

  // 5. Fetch all active tenancies
  const [tenancies] = await pool.query(
    `SELECT ten.id, ten.tenant_id, ten.unit_id, ten.rent_amount,
            u.unit_number, u.property_id,
            usr.full_name AS tenant_name, usr.phone AS tenant_phone
     FROM tenancies ten
     JOIN units u       ON ten.unit_id   = u.id
     JOIN tenants t     ON ten.tenant_id = t.id
     JOIN users usr     ON t.user_id     = usr.id
     WHERE ten.status = 'active'`);
  console.log(`  ✅  ${tenancies.length} active tenancies — building 6-month history...`);

  // 6. 6-month invoice + payment history
  let invCount = 0, payCount = 0, rcpSeq = 1000;

  for (const ten of tenancies) {
    for (let m = 5; m >= 0; m--) {
      const dueDate = monthDate(m, 5);

      // Skip if already exists
      const [[exists]] = await pool.query(
        "SELECT id FROM invoices WHERE tenancy_id=? AND type='rent' AND due_date=?",
        [ten.id, dueDate]);
      if (exists) continue;

      const [inv] = await pool.query(
        'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,status) VALUES (?,?,?,?,?,?)',
        [ten.id, 'rent', ten.rent_amount, ten.rent_amount, dueDate, 'unpaid']);
      invCount++;

      // Ledger debit (ignore error if table missing)
      pool.query(
        'INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
        [ten.id, 'debit', ten.rent_amount, 'RENT invoice', 'invoice', inv.insertId]
      ).catch(() => {});

      if (m > 0) {
        const roll = Math.random();

        if (roll < 0.80) {
          // Fully paid
          const code     = mpesaCode();
          const paidDate = sqlDT(monthDate(m, rInt(4, 9)));
          const phone    = ten.tenant_phone || '0700000001';

          const [pay] = await pool.query(
            `INSERT INTO payments
             (invoice_id,tenancy_id,amount,payment_method,transaction_code,mpesa_phone,paid_at,recorded_by)
             VALUES (?,?,?,'mpesa',?,?,?,?)`,
            [inv.insertId, ten.id, ten.rent_amount, code, phone, paidDate, admin.id]);

          await pool.query("UPDATE invoices SET balance=0,status='paid' WHERE id=?", [inv.insertId]);

          const yr = new Date(dueDate).getFullYear();
          const rn = `RCP-${yr}-${String(rcpSeq++).padStart(5,'0')}`;
          pool.query('INSERT INTO receipts (payment_id,receipt_number) VALUES (?,?)',
            [pay.insertId, rn]).catch(() => {});

          pool.query(
            'INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
            [ten.id, 'credit', ten.rent_amount, `MPESA ${code}`, 'payment', pay.insertId]
          ).catch(() => {});

          payCount++;

        } else if (roll < 0.92) {
          // Partial
          const partial  = Math.round(ten.rent_amount * (0.5 + Math.random() * 0.3));
          const code     = mpesaCode();
          const paidDate = sqlDT(monthDate(m, rInt(3, 14)));

          const [pay] = await pool.query(
            `INSERT INTO payments
             (invoice_id,tenancy_id,amount,payment_method,transaction_code,mpesa_phone,paid_at,recorded_by)
             VALUES (?,?,?,'mpesa',?,?,?,?)`,
            [inv.insertId, ten.id, partial, code, ten.tenant_phone || '0700000001', paidDate, admin.id]);

          await pool.query("UPDATE invoices SET balance=?,status='partial' WHERE id=?",
            [ten.rent_amount - partial, inv.insertId]);

          pool.query(
            'INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
            [ten.id, 'credit', partial, `MPESA ${code}`, 'payment', pay.insertId]
          ).catch(() => {});

          payCount++;
        } else {
          // Overdue — no payment
          await pool.query("UPDATE invoices SET status='overdue' WHERE id=?", [inv.insertId]);
        }
      } else {
        // Current month — overdue if past the 5th
        if (new Date(dueDate) < new Date()) {
          await pool.query("UPDATE invoices SET status='overdue' WHERE id=?", [inv.insertId]);
        }
      }
    }
  }
  console.log(`  ✅  ${invCount} invoices created, ${payCount} payments recorded`);

  // 7. Water invoices
  let waterCount = 0;
  for (const ten of tenancies.slice(0, Math.min(6, tenancies.length))) {
    const due = daysAgo(-7);
    const [[wEx]] = await pool.query(
      "SELECT id FROM invoices WHERE tenancy_id=? AND type='water' AND due_date=?", [ten.id, due]);
    if (!wEx) {
      await pool.query(
        'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,status) VALUES (?,?,?,?,?,?)',
        [ten.id, 'water', rInt(900, 3800), rInt(900, 3800), due, 'unpaid']);
      waterCount++;
    }
  }
  if (waterCount) console.log(`  ✅  ${waterCount} water invoices created`);

  // 8. Maintenance requests
  const [[{ mCount }]] = await pool.query('SELECT COUNT(*) AS mCount FROM maintenance_requests');
  if (parseInt(mCount) < 4) {
    const MAINT = [
      ['Leaking tap in bathroom',     'plumbing',   'normal',    'open'],
      ['Broken window latch',         'structural', 'urgent',    'open'],
      ['Faulty electric socket',      'electrical', 'urgent',    'in_progress'],
      ['Blocked kitchen drain',       'plumbing',   'normal',    'in_progress'],
      ['Door lock not working',       'structural', 'normal',    'open'],
      ['Ceiling paint peeling',       'painting',   'low',       'open'],
      ['Water heater not working',    'plumbing',   'urgent',    'open'],
      ['Broken toilet flush',         'plumbing',   'urgent',    'resolved'],
      ['Pest infestation report',     'pest',       'emergency', 'resolved'],
      ['Cracked bathroom tiles',      'structural', 'low',       'open'],
    ];
    for (const [i, [title, cat, priority, status]] of MAINT.entries()) {
      const ten = tenancies[i % tenancies.length];
      await pool.query(
        `INSERT INTO maintenance_requests
         (unit_id,property_id,title,description,category,priority,status,created_at)
         VALUES (?,?,?,?,?,?,?,DATE_SUB(NOW(),INTERVAL ? DAY))`,
        [ten.unit_id, ten.property_id, title,
         'Please attend to this at the earliest convenience.',
         cat, priority, status, rInt(1, 45)]
      ).catch(() => {});
    }
    console.log(`  ✅  ${MAINT.length} maintenance requests created`);
  } else {
    console.log(`  ℹ️   Maintenance: ${mCount} records already exist — skipped`);
  }

  // 9. Visitors today
  const [[{ vToday }]] = await pool.query(
    'SELECT COUNT(*) AS vToday FROM visitors WHERE DATE(check_in)=CURDATE()');
  if (parseInt(vToday) === 0) {
    const VISITORS = [
      ['John Kamau',      '0712000001', 'Family visit',      true ],
      ['Mary Njeri',      '0723000002', 'Delivery',          true ],
      ['Peter Oloo',      '0734000003', 'Maintenance work',  true ],
      ['Grace Atieno',    '0745000004', 'Friend visit',      false],
      ['Samuel Kipchoge', '0756000005', 'Official business', false],
    ];
    for (const [i, [name, phone, purpose, isOut]] of VISITORS.entries()) {
      const ten = tenancies[i % tenancies.length];
      const inT = new Date(); inT.setHours(8 + i * 2, rInt(0, 59), 0);
      const outT = isOut ? new Date(inT.getTime() + rInt(30, 180) * 60000) : null;

      await pool.query(
        `INSERT INTO visitors
         (property_id,unit_id,name,phone,purpose,checked_in_by,
          check_in,check_out,status)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [ten.property_id, ten.unit_id, name, phone, purpose, admin.id,
         inT.toISOString().slice(0,19).replace('T',' '),
         outT ? outT.toISOString().slice(0,19).replace('T',' ') : null,
         isOut ? 'checked_out' : 'checked_in']
      ).catch(() => {});
    }
    console.log(`  ✅  ${VISITORS.length} visitor records created (today)`);
  }

  // 10. Expenses
  const [[{ eCount }]] = await pool.query('SELECT COUNT(*) AS eCount FROM expenses');
  if (parseInt(eCount) < 3) {
    const EXPS = [
      ['Security guard salary',   25000, 'security',    'Internal',           30],
      ['Plumber — Block A',        4500, 'plumbing',    'Njoro Plumbers Ltd', 14],
      ['Compound cleaning',        3200, 'cleaning',    'CleanPro Services',   7],
      ['Water bill — March',       8750, 'utilities',   'Nairobi Water',      20],
      ['Hallway repainting',      15000, 'maintenance', 'Bright Painters',    45],
      ['Electrician — staircase',  9200, 'electrical',  'PowerFix Kenya',     10],
      ['Garbage collection',       2500, 'cleaning',    'City Council',       28],
      ['Insurance premium Q2',    45000, 'insurance',   'Jubilee Insurance',  60],
    ];
    for (const [i, [title, amount, category, vendor, days]] of EXPS.entries()) {
      const prop = properties[i % properties.length];
      await pool.query(
        'INSERT INTO expenses (property_id,title,amount,category,vendor,expense_date,created_by) VALUES (?,?,?,?,?,?,?)',
        [prop.id, title, amount, category, vendor, daysAgo(days), admin.id]
      ).catch(() =>
        pool.query(
          'INSERT INTO expenses (property_id,title,amount,category,expense_date,created_by) VALUES (?,?,?,?,?,?)',
          [prop.id, title, amount, category, daysAgo(days), admin.id]
        ).catch(() => {})
      );
    }
    console.log(`  ✅  ${EXPS.length} expenses created`);
  } else {
    console.log(`  ℹ️   Expenses: ${eCount} records exist — skipped`);
  }

  // 11. Extra announcements
  const [[{ aCount }]] = await pool.query('SELECT COUNT(*) AS aCount FROM announcements');
  if (parseInt(aCount) < 2) {
    const ANNS = [
      ['Rent reminder — this month',  'Kindly ensure rent is paid by the 5th to avoid late fees.'],
      ['Security alert',             'All visitors must be signed in at the gate. Do not allow tailgating.'],
      ['Estate cleaning day',        'Saturday 9am: communal cleaning. All residents please participate.'],
    ];
    for (const [title, message] of ANNS) {
      await pool.query(
        'INSERT INTO announcements (property_id,title,message,created_by) VALUES (?,?,?,?)',
        [properties[0].id, title, message, admin.id]).catch(() => {});
    }
    console.log(`  ✅  ${ANNS.length} announcements created`);
  }

  // 12. Parking slots
  const [[{ pCount }]] = await pool.query('SELECT COUNT(*) AS pCount FROM parking_slots');
  if (parseInt(pCount) === 0) {
    for (const prop of properties) {
      for (let i = 1; i <= 8; i++) {
        await pool.query(
          "INSERT INTO parking_slots (property_id,slot_number,status) VALUES (?,?,?)",
          [prop.id, `P${pad(i)}`, i <= 5 ? 'occupied' : 'vacant']).catch(() => {});
      }
    }
    console.log('  ✅  Parking slots created');
  }

  // Summary
  const [[fi]] = await pool.query('SELECT COUNT(*) n FROM invoices');
  const [[fp]] = await pool.query('SELECT COUNT(*) n FROM payments');
  const [[ft]] = await pool.query("SELECT COUNT(*) n FROM tenancies WHERE status='active'");
  const [[fo]] = await pool.query("SELECT COUNT(*) n FROM invoices WHERE status='overdue'");

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   ✅  Seed complete — refresh your browser now!   ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Active tenancies : ${String(ft.n).padEnd(5)}                         ║`);
  console.log(`║  Total invoices   : ${String(fi.n).padEnd(5)} (${fo.n} overdue)              ║`);
  console.log(`║  Total payments   : ${String(fp.n).padEnd(5)}                         ║`);
  console.log('╚════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

run().catch(e => {
  console.error('\n❌  Seed failed:', e.message);
  console.error(e.stack);
  process.exit(1);
});