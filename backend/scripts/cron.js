'use strict';

/**
 * Smart Nyumba Pro — Cron Job Engine
 * All jobs write to cron_logs. Failed jobs notify super_admin.
 * Each job wrapped so one failure never breaks others.
 */

const cron = require('node-cron');
const pool = require('../config/db');
const sms  = require('../services/sms');

// ── Helpers ───────────────────────────────────────────────────
const getSetting = async (key, def = null) => {
  try {
    const [[r]] = await pool.query('SELECT setting_value FROM settings WHERE setting_key=?', [key]);
    return r?.setting_value ?? def;
  } catch { return def; }
};

const notify = async ({ user_id, type, title, message, action_url }) => {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
      [user_id, type, title, message, action_url || null]
    );
  } catch (_) {}
};

// Safe SMS + WhatsApp dual-send
const sendAlert = async ({ phone, message, type, user_id }) => {
  try { await sms.send({ phone, message, type, user_id }); } catch (_) {}
  try {
    const wa = require('../services/whatsapp');
    await wa.send({ phone, message, type, user_id });
  } catch (_) {}
};

const cronLog = async (job_name) => {
  try {
    const [r] = await pool.query(
      'INSERT INTO cron_logs (job_name,status,started_at) VALUES (?,?,NOW())',
      [job_name, 'running']);
    return r.insertId;
  } catch { return null; }
};

const cronLogDone = async (logId, rows = 0, note = null) => {
  if (!logId) return;
  try { await pool.query('UPDATE cron_logs SET status=?,rows_affected=?,note=?,finished_at=NOW() WHERE id=?', ['success', rows, note, logId]); } catch (_) {}
};

const cronLogFail = async (logId, error_message) => {
  if (!logId) return;
  try {
    // Try possible column names for error field
    try {
      await pool.query('UPDATE cron_logs SET status=?,error_message=?,finished_at=NOW() WHERE id=?', ['failed', String(error_message).slice(0,1000), logId]);
    } catch (_) {
      try { await pool.query('UPDATE cron_logs SET status=?,note=?,finished_at=NOW() WHERE id=?', ['failed', String(error_message).slice(0,500), logId]); }
      catch (_2) { /* non-fatal */ }
    }
    const [admins] = await pool.query("SELECT id FROM users WHERE role='super_admin' AND is_active=1 LIMIT 3");
    for (const a of admins) await notify({ user_id: a.id, type:'system', title:'⚠️ Cron job failed', message: String(error_message).slice(0,120), action_url:'/admin/settings' });
  } catch (_) {}
};

const safeRun = (jobName, fn) => async () => {
  const logId = await cronLog(jobName);
  const start = Date.now();
  try {
    const result = await fn();
    global.logger?.info(`CRON [${jobName}] OK in ${Date.now()-start}ms — ${result?.summary||''}`);
    await cronLogDone(logId, result?.rows||0, result?.summary||null);
  } catch (e) {
    global.logger?.error(`CRON [${jobName}] FAILED in ${Date.now()-start}ms — ${e.message}`);
    await cronLogFail(logId, e.message);
  }
};

// ── 1. Mark overdue invoices ──────────────────────────────────
async function markOverdueInvoices() {
  const days = parseInt(await getSetting('grace_period_days', 5));
  // FEATURE: fire invoice.overdue per org for webhook subscribers. Need
  // the actual rows (not just an affected-row count) to know which org
  // each newly-overdue invoice belongs to, so select first, then update.
  const [toFlag] = await pool.query(
    "SELECT id, org_id, tenancy_id, amount, balance FROM invoices WHERE status='unpaid' AND due_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)",
    [days]);
  if (!toFlag.length) return { rows: 0, summary: `Marked 0 invoices overdue (grace=${days}d)` };
  const ids = toFlag.map(i => i.id);
  await pool.query(`UPDATE invoices SET status='overdue' WHERE id IN (${ids.map(()=>'?').join(',')})`, ids);
  for (const inv of toFlag) {
    if (!inv.org_id) continue;
    require('../services/webhooks').deliverEvent('invoice.overdue', {
      invoice_id: inv.id, tenancy_id: inv.tenancy_id, amount: Number(inv.amount), balance: Number(inv.balance),
    }, inv.org_id);
  }
  return { rows: toFlag.length, summary: `Marked ${toFlag.length} invoices overdue (grace=${days}d)` };
}

// ── 2. Apply late fees ────────────────────────────────────────
async function applyLateFees() {
  if ((await getSetting('late_fees_enabled')) !== '1') return { rows: 0, summary: 'Skipped — late fees disabled' };
  const pct = parseFloat(await getSetting('late_fee_percent', 5)) / 100;
  const [overdue] = await pool.query(
    `SELECT i.*,ten.id AS tenancy_id FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id
     WHERE i.status='overdue' AND i.type!='penalty'
     AND NOT EXISTS (SELECT 1 FROM invoices lf WHERE lf.parent_invoice_id=i.id AND DATE(lf.created_at)=CURDATE())`);
  let applied = 0;
  for (const inv of overdue) {
    const fee = parseFloat((parseFloat(inv.balance) * pct).toFixed(2));
    if (fee < 1) continue;
    // BUG FIX: this INSERT never included org_id, and the column is
    // `NOT NULL DEFAULT 1` — every automatically-generated late fee, for
    // every organisation on the platform, was silently stamped org_id=1.
    // This runs unattended on a schedule, so it wasn't a one-off mistake
    // a user could make — it corrupted a late fee record every single
    // time this job ran, for every org other than org 1. inv.org_id is
    // already available (SELECT i.* above), no extra query needed.
    await pool.query(
      "INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,parent_invoice_id,notes,org_id) VALUES (?,'penalty',?,?,CURDATE(),?,?,?)",
      [inv.tenancy_id, fee, fee, inv.id, `Late fee (${pct*100}%) on invoice #${inv.id}`, inv.org_id]);
    applied++;
  }
  return { rows: applied, summary: `Applied ${applied} late fee invoices` };
}

// ── 3. Generate monthly rent invoices ─────────────────────────
// Respects each tenancy's payment_due_day column (defaults to global setting)
async function generateMonthlyInvoices() {
  const globalDay = parseInt(await getSetting('auto_invoice_day', 1));
  const today     = new Date().getDate();

  const [tenancies] = await pool.query(
    "SELECT * FROM tenancies WHERE status='active' AND COALESCE(billing_mode,'auto')='auto'"
  );

  let gen = 0, skipped = 0, errors = 0;

  // Process only tenancies whose due day matches today
  const dueTenancies = tenancies.filter(ten => {
    const dueDay = parseInt(ten.payment_due_day || globalDay);
    return today === dueDay;
  });

  if (!dueTenancies.length) {
    return { rows: 0, summary: `Skipped — no tenancies due on day ${today}` };
  }

  const conn = await pool.getConnection();
  try {
    for (const ten of dueTenancies) {
      // BUG FIX: this set due_date 30 days in the future even though this
      // job only ever fires exactly on the tenancy's own due day (see the
      // dueTenancies filter above) — so a rent invoice's due_date was
      // always ~a month later than the day rent was actually due. Since
      // markOverdueInvoices/applyLateFees key off due_date, unpaid rent
      // was never flagged overdue (and no late fee ever applied) until
      // roughly a month after it truly became overdue. due_date should be
      // today — the day this invoice is being raised for.
      const dueDate = new Date();
      const due = dueDate.toISOString().split('T')[0];
      const my  = `${dueDate.getFullYear()}-${String(dueDate.getMonth()+1).padStart(2,'0')}`;

      const [[ex]] = await conn.query(
        "SELECT id FROM invoices WHERE tenancy_id=? AND type='rent' AND month_year=?",
        [ten.id, my]);
      if (ex) { skipped++; continue; }

      try {
        await conn.beginTransaction();
        // BUG FIX: same missing org_id as applyLateFees above — this is
        // the automated MONTHLY RENT invoice generator, run unattended
        // for every active tenancy on the platform, so every rent
        // invoice ever auto-generated (for any org other than org 1) was
        // silently mis-filed with org_id=1. ten.org_id is already
        // available (SELECT * FROM tenancies above), no extra query needed.
        const [r] = await conn.query(
          'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,month_year,org_id) VALUES (?,?,?,?,?,?,?)',
          [ten.id, 'rent', ten.rent_amount, ten.rent_amount, due, my, ten.org_id]);
        await conn.query(
          'INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
          [ten.id, 'debit', ten.rent_amount, `RENT invoice ${my}`, 'invoice', r.insertId]);
        await conn.commit();
        // FEATURE: fire invoice.created for org webhook subscribers.
        if (ten.org_id) {
          require('../services/webhooks').deliverEvent('invoice.created', {
            invoice_id: r.insertId, tenancy_id: ten.id, type: 'rent',
            amount: Number(ten.rent_amount), due_date: due,
          }, ten.org_id);
        }
        gen++;
      } catch (invErr) {
        await conn.rollback().catch(() => {});
        errors++;
      }
    }
  } finally {
    conn.release();
  }

  return {
    rows: gen,
    summary: `Generated ${gen} invoices (day ${today}), skipped ${skipped} duplicates, ${errors} errors`,
  };
}

// ── 4. Send rent reminders (SMS + WhatsApp) ───────────────────
async function sendRentReminders() {
  if ((await getSetting('sms_reminders_enabled')) !== '1') return { rows: 0, summary: 'SMS reminders disabled' };
  const [invoices] = await pool.query(
    `SELECT i.id,i.amount,i.due_date,i.tenancy_id,u.full_name,u.phone,u.id AS user_id,un.unit_number
     FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id JOIN tenants t ON ten.tenant_id=t.id
     JOIN users u ON t.user_id=u.id JOIN units un ON ten.unit_id=un.id
     WHERE i.status IN('unpaid','overdue') AND i.type='rent'
       AND i.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
       AND u.phone IS NOT NULL`);
  let sent = 0;
  for (const inv of invoices) {
    try {
      const msg = 'Dear ' + inv.full_name.split(' ')[0] + ', your rent of KES ' +
        Number(inv.amount).toLocaleString() + ' for unit ' + inv.unit_number +
        ' is due on ' + inv.due_date + '. Pay via M-Pesa to avoid late fees. SmartNyumba.';
      await sendAlert({ phone: inv.phone, message: msg, type: 'reminder', user_id: inv.user_id });
      sent++;
    } catch (_) {}
  }
  return { rows: sent, summary: `Sent ${sent} reminders` };
}

// ── 5. Lease expiry notifications (SMS + WhatsApp added) ──────
async function checkLeaseExpiry() {
  const INTERVALS = [60, 30, 7];
  let total = 0;
  for (const days of INTERVALS) {
    const [expiring] = await pool.query(
      `SELECT ten.id,ten.end_date,ten.rent_amount,
              u.id AS user_id,u.full_name AS tenant_name,u.phone AS tenant_phone,
              un.unit_number,pr.name AS property_name,
              mgr.id AS manager_id,mgr.phone AS manager_phone
       FROM tenancies ten JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
       JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
       LEFT JOIN users mgr ON pr.manager_id=mgr.id
       WHERE ten.status='active' AND ten.end_date IS NOT NULL AND DATEDIFF(ten.end_date,CURDATE())=?`,
      [days]);
    for (const t of expiring) {
      // In-app
      await notify({ user_id:t.user_id, type:'lease_expiry', title:`Lease expires in ${days} day${days!==1?'s':''}`,
        message:`Your lease for unit ${t.unit_number} expires on ${t.end_date}. Contact your manager to renew.`, action_url:'/tenant' });
      if (t.manager_id) await notify({ user_id:t.manager_id, type:'lease_expiry',
        title:`Lease expiry — ${t.tenant_name} (${t.unit_number})`,
        message:`${t.tenant_name}'s lease expires in ${days} days (${t.end_date}).`, action_url:'/admin/tenancies' });
      // SMS + WhatsApp
      if (t.tenant_phone) {
        const msg = 'Dear ' + t.tenant_name.split(' ')[0] + ', your lease for unit ' + t.unit_number +
          ' expires in ' + days + ' day' + (days!==1?'s':'') + ' (' + t.end_date + '). Please contact your manager to renew. SmartNyumba.';
        await sendAlert({ phone: t.tenant_phone, message: msg, type: 'lease_expiry', user_id: t.user_id });
      }
      total++;
    }
  }
  return { rows: total, summary: `Sent ${total} lease expiry notifications` };
}

// ── 6. Vacate notice processing ───────────────────────────────
async function processVacateNotices() {
  const today = new Date().toISOString().split('T')[0];
  const [notices] = await pool.query(
    `SELECT vn.*,ten.unit_id,u.id AS user_id,u.full_name,u.phone,
            un.unit_number,pr.name AS property_name,mgr.id AS manager_id
     FROM vacate_notices vn JOIN tenancies ten ON vn.tenancy_id=ten.id
     JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
     JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
     LEFT JOIN users mgr ON pr.manager_id=mgr.id
     WHERE vn.status='approved' AND vn.vacate_date=?`, [today]);
  let processed = 0;
  for (const n of notices) {
    try {
      await pool.query("UPDATE tenancies SET status='terminated',updated_at=NOW() WHERE id=?", [n.tenancy_id]);
      await pool.query("UPDATE units SET status='vacant' WHERE id=?", [n.unit_id]);
      await pool.query("UPDATE vacate_notices SET status='completed' WHERE id=?", [n.id]);
      // FEATURE: fire tenancy.terminated for org webhook subscribers —
      // this is the other place (besides tenancies.js#terminate) a
      // tenancy actually ends.
      if (n.org_id) {
        require('../services/webhooks').deliverEvent('tenancy.terminated', {
          tenancy_id: n.tenancy_id, unit_id: n.unit_id, status: 'terminated', end_date: today,
        }, n.org_id);
      }
      processed++;
    } catch (e) { global.logger?.error(`Vacate processing failed for notice ${n.id}: ${e.message}`); }
  }
  return { rows: processed, summary: `Processed ${processed} vacate notices` };
}

// ── 7. Clean up expired refresh tokens ───────────────────────
async function cleanExpiredTokens() {
  const [r] = await pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
  return { rows: r.affectedRows, summary: `Deleted ${r.affectedRows} expired refresh tokens` };
}

// ── 8. Mark expired M-Pesa transactions ──────────────────────
async function expireStuckMpesa() {
  try {
    const [r] = await pool.query(
      "UPDATE mpesa_transactions SET status='expired' WHERE status='pending' AND created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)"
    );
    return { rows: r.affectedRows, summary: `Expired ${r.affectedRows} stuck M-Pesa transactions` };
  } catch (e) {
    return { rows: 0, summary: 'Skipped — ' + e.message };
  }
}

// ── Schedule & export ─────────────────────────────────────────
const start = () => {

// ── Process recurring expenses ─────────────────────────────────────────────
async function processRecurringExpenses() {
  const today = new Date().toISOString().slice(0, 10);
  const [expenses] = await pool.query(`
    SELECT e.*, p.name AS property_name
    FROM expenses e
    JOIN properties p ON e.property_id = p.id
    WHERE e.is_recurring = 1
      AND e.next_due_date IS NOT NULL
      AND e.next_due_date <= ?
      AND (e.recurrence_end_date IS NULL OR e.recurrence_end_date >= ?)
  `, [today, today]);

  let created = 0;
  for (const exp of expenses) {
    // Create new expense entry for this period
    // BUG FIX: same missing org_id pattern found and fixed in
    // applyLateFees() and generateMonthlyInvoices() above — this
    // unattended recurring-expense job was silently mis-filing every
    // auto-generated expense under org_id=1. exp.org_id is already
    // available (SELECT e.* above).
    await pool.query(`
      INSERT INTO expenses (property_id, title, description, amount, expense_date,
        category, receipt_url, created_by, is_recurring, recurrence_type, next_due_date, org_id)
      VALUES (?,?,?,?,?,?,?,?,0,NULL,NULL,?)
    `, [exp.property_id, exp.title, exp.description, exp.amount, today,
        exp.category, exp.receipt_url, exp.created_by, exp.org_id]);

    // Calculate and update next_due_date based on interval
    const nextDate = new Date(exp.next_due_date);
    switch (exp.recurrence_type) {
      case 'weekly':   nextDate.setDate(nextDate.getDate() + 7);  break;
      case 'monthly':  nextDate.setMonth(nextDate.getMonth() + 1); break;
      case 'quarterly':nextDate.setMonth(nextDate.getMonth() + 3); break;
      case 'annually': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
      default:         nextDate.setMonth(nextDate.getMonth() + 1);
    }
    await pool.query('UPDATE expenses SET next_due_date=? WHERE id=?',
      [nextDate.toISOString().slice(0, 10), exp.id]);
    created++;
  }
  return { rows: created, summary: `${created} recurring expense(s) generated` };
}

  cron.schedule('10 0 * * *', safeRun('mark_overdue',       markOverdueInvoices),   { timezone: 'Africa/Nairobi' });
  cron.schedule('20 0 * * *', safeRun('apply_late_fees',    applyLateFees),         { timezone: 'Africa/Nairobi' });
  cron.schedule('0 6 * * *',  safeRun('monthly_invoices',   generateMonthlyInvoices), { timezone: 'Africa/Nairobi' });
  cron.schedule('0 8 * * *',  safeRun('rent_reminders',     sendRentReminders),     { timezone: 'Africa/Nairobi' });
  cron.schedule('0 9 * * *',  safeRun('lease_expiry',       checkLeaseExpiry),      { timezone: 'Africa/Nairobi' });
  cron.schedule('30 0 * * *', safeRun('vacate_notices',     processVacateNotices),  { timezone: 'Africa/Nairobi' });
  cron.schedule('0 3 * * *',  safeRun('clean_tokens',       cleanExpiredTokens),    { timezone: 'Africa/Nairobi' }); // daily
  cron.schedule('0 1 * * *',  safeRun('recurring_expenses', processRecurringExpenses), { timezone: 'Africa/Nairobi' }); // daily 1am
  cron.schedule('0 * * * *',  safeRun('expire_mpesa',       expireStuckMpesa),      { timezone: 'Africa/Nairobi' }); // hourly
  // ── SaaS cron jobs ──────────────────────────────────────────
  // FIX: these were previously registered outside start() at module-load time,
  // firing the moment cron.js was require()'d — before DB health was confirmed
  // and before env validation. Moved here so they share the same lifecycle.

  // Message queue processor — every 2 minutes
  cron.schedule('*/2 * * * *', safeRun('message_queue_and_webhooks', async () => {
    const { processPending } = require('../utils/msgQueue');
    const { retryPending }   = require('../services/webhooks');
    const [sent] = await Promise.all([processPending(), retryPending()]);
    if (sent > 0) global.logger?.info(`message_queue: processed ${sent} messages`);
  }), { timezone: 'Africa/Nairobi' });

  // Monthly KPI digest — 1st of every month at 08:00 EAT
  cron.schedule('0 8 1 * *', safeRun('monthly_digest', async () => {
    const pool = require('../config/db');
    const email = require('../services/email');
    const [orgs] = await pool.query("SELECT * FROM organisations WHERE is_active=1");
    for (const org of orgs) {
      try {
        const [[{ total_collected }]] = await pool.query(
          "SELECT COALESCE(SUM(amount),0) AS total_collected FROM payments WHERE org_id=? AND paid_at>=DATE_FORMAT(NOW(),'%Y-%m-01')",
          [org.id]);
        const [[{ occupancy }]] = await pool.query(
          "SELECT ROUND(COUNT(CASE WHEN status='active' THEN 1 END)*100.0/GREATEST(COUNT(*),1),1) AS occupancy FROM tenancies WHERE org_id=?",
          [org.id]);
        const [[{ open_maintenance }]] = await pool.query(
          "SELECT COUNT(*) AS open_maintenance FROM maintenance_requests WHERE org_id=? AND status NOT IN ('completed','closed')",
          [org.id]);
        const [[{ arrears }]] = await pool.query(
          "SELECT COALESCE(SUM(balance),0) AS arrears FROM invoices WHERE org_id=? AND status IN ('unpaid','overdue','partial')",
          [org.id]);

        if (!org.billing_email) continue;
        await email.send({
          to: org.billing_email,
          subject: `SmartNyumba Monthly Digest — ${org.name}`,
          html: `<h2>${org.name} — Monthly Report</h2>
                 <table><tr><td><b>Rent Collected</b></td><td>KES ${Number(total_collected).toLocaleString()}</td></tr>
                 <tr><td><b>Occupancy</b></td><td>${occupancy}%</td></tr>
                 <tr><td><b>Open Maintenance</b></td><td>${open_maintenance} requests</td></tr>
                 <tr><td><b>Total Arrears</b></td><td>KES ${Number(arrears).toLocaleString()}</td></tr></table>
                 <p><a href="${process.env.FRONTEND_URL||'http://localhost:5173'}/admin/reports">View full report →</a></p>`,
        }).catch(()=>{});
      } catch(e) { global.logger?.error('monthly_digest org '+org.id+': '+e.message); }
    }
  }), { timezone: 'Africa/Nairobi' });

  // Plan expiry check — daily at 07:00 EAT
  cron.schedule('0 7 * * *', safeRun('plan_expiry', async () => {
    const pool = require('../config/db');
    const email = require('../services/email');
    const [expiring] = await pool.query(
      "SELECT * FROM organisations WHERE is_active=1 AND plan_expires_at BETWEEN NOW() AND DATE_ADD(NOW(),INTERVAL 7 DAY)");
    for (const org of expiring) {
      const days = Math.ceil((new Date(org.plan_expires_at)-Date.now())/86400000);
      if (![7,3,1].includes(days)) continue;
      await email.send({
        to: org.billing_email,
        subject: `SmartNyumba: Your plan expires in ${days} day${days>1?'s':''}`,
        html: `<p>Hi ${org.name}, your SmartNyumba ${org.plan} plan expires in <b>${days} days</b>.</p>
               <p><a href="${process.env.FRONTEND_URL||''}/billing">Renew now →</a></p>`,
      }).catch(()=>{});
    }
    // Deactivate expired orgs
    await pool.query("UPDATE organisations SET is_active=0 WHERE plan_expires_at<NOW() AND plan!='enterprise'").catch(()=>{});
  }), { timezone: 'Africa/Nairobi' });

  global.logger?.info('✅ Cron engine started (Africa/Nairobi timezone)');
};

module.exports = { start };
