// backend/controllers/admin/enterprise.js
// New controllers for all enterprise features:
//   GET/POST /api/service-charges/rates           – configure per-property service charge rates
//   POST     /api/service-charges/generate        – auto-generate service charge invoices for a month
//   POST     /api/service-charges/meter-reading   – enter shared meter reading (splits to units)
//   GET      /api/reports/rent-roll               – rent roll report
//   GET      /api/security/vehicle-lookup         – plate → tenant info + access status
//   POST     /api/maintenance/incident            – security/caretaker raise incident
//   GET      /api/import/template                 – download CSV template
//   POST     /api/import/tenants                  – bulk import tenants from CSV/JSON

const pool = require('../../config/db');
const { ok, err, safeErr } = require("../../utils/helpers");

// ══════════════════════════════════════════════════════════════
// SERVICE CHARGE RATES
// ══════════════════════════════════════════════════════════════

// GET /api/service-charges/rates?property_id=1
exports.getRates = async (req, res) => {
  try {
    const pid = req.query.property_id;
    if (!pid) return err(res, 'property_id required');
    // SECURITY FIX: no org check — this route was unreachable until the
    // export-name fix in routes/enterprise.js, so this never got caught
    // by the earlier audit pass. property_id came straight from the
    // query string; a property_manager could read another org's rates.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [pid, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);
    const [rows] = await pool.query(
      'SELECT * FROM service_charge_rates WHERE property_id=? ORDER BY charge_type',
      [pid]);
    ok(res, { rates: rows });
  } catch(e) { safeErr(res, e); }
};

// POST /api/service-charges/rates
// Body: { property_id, charge_type, label, billing_method, amount }
exports.upsertRate = async (req, res) => {
  try {
    const { property_id, charge_type, label, billing_method, amount, is_active } = req.body;
    if (!property_id || !charge_type || !label) return err(res, 'property_id, charge_type, label required');
    // SECURITY FIX: same missing org check — see getRates() above.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);

    await pool.query(`
      INSERT INTO service_charge_rates (property_id,charge_type,label,billing_method,amount,is_active)
      VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE label=VALUES(label), billing_method=VALUES(billing_method),
        amount=VALUES(amount), is_active=VALUES(is_active)`,
      [property_id, charge_type, label, billing_method||'fixed', amount||0, is_active??1]);

    ok(res, { message: 'Service charge rate saved' });
  } catch(e) { safeErr(res, e); }
};

// DELETE /api/service-charges/rates/:id
exports.deleteRate = async (req, res) => {
  try {
    // SECURITY FIX: no org check — scoped through the property join.
    const [r] = await pool.query(
      `UPDATE service_charge_rates scr JOIN properties p ON scr.property_id=p.id
       SET scr.is_active=0 WHERE scr.id=? AND p.org_id=?`, [req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'Rate not found', 404);
    ok(res, { message: 'Rate deactivated' });
  } catch(e) { safeErr(res, e); }
};

// POST /api/service-charges/generate
// Body: { property_id, month_year, charge_types[] }
// Generates service charge invoices for all active tenancies in a property
// ARCHITECTURAL NOTE: routes/serviceCharges.js (mounted at
// /api/service-charges) has a second implementation of this — that's
// the one the actual frontend calls; this one is mounted at
// /api/enterprise/service-charges via routes/enterprise.js and isn't
// called by this repo's UI. Both were independently found to have the
// same missing-org_id bug this session and both were fixed — if you
// change the billing logic here, check the other one too, or they will
// silently drift apart again.
exports.generateServiceCharges = async (req, res) => {
  try {
    const { property_id, month_year, charge_types } = req.body;
    if (!property_id || !month_year) return err(res, 'property_id and month_year required');
    // SECURITY FIX: no org check — see getRates() above.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);

    const my = month_year; // e.g. '2024-03'
    const [yr, mo] = my.split('-');
    // Due date = last day of the month
    const dueDate = new Date(parseInt(yr), parseInt(mo), 0).toISOString().split('T')[0];

    // Get active rates for property
    const rateFilter = charge_types?.length
      ? `AND charge_type IN (${charge_types.map(()=>'?').join(',')})` : '';
    const [rates] = await pool.query(
      `SELECT * FROM service_charge_rates WHERE property_id=? AND is_active=1 ${rateFilter}`,
      [property_id, ...(charge_types||[])]);

    if (!rates.length) return err(res, 'No active service charge rates found for this property');

    // Get active tenancies in property
    const [tenancies] = await pool.query(`
      SELECT ten.id AS tenancy_id, ten.rent_amount, u.full_name AS tenant_name
      FROM tenancies ten
      JOIN units un ON ten.unit_id=un.id
      WHERE un.property_id=? AND ten.status='active'`, [property_id]);

    if (!tenancies.length) return err(res, 'No active tenancies found');

    let generated = 0, skipped = 0;
    for (const ten of tenancies) {
      for (const rate of rates) {
        // Skip if already generated this month
        const [[ex]] = await pool.query(
          'SELECT id FROM invoices WHERE tenancy_id=? AND type=? AND month_year=?',
          [ten.tenancy_id, rate.charge_type, my]);
        if (ex) { skipped++; continue; }

        // BUG FIX: this INSERT never included org_id, and the column is
        // `NOT NULL DEFAULT 1` — every service-charge invoice generated
        // through this endpoint was silently stamped org_id=1 regardless
        // of which organisation the property actually belongs to. For any
        // org other than org 1, the invoice would be invisible to that
        // org's own org_id-scoped queries (tenants/managers would never
        // see it); for org 1 specifically, it's the reverse — invoices
        // for other orgs' properties would incorrectly appear in org 1's
        // invoice list. req.user.org_id is already the verified owner of
        // this property (checked above), so use that, not the default.
        await pool.query(
          'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,month_year,notes,org_id) VALUES (?,?,?,?,?,?,?,?)',
          [ten.tenancy_id, rate.charge_type, rate.amount, rate.amount, dueDate, my,
           `${rate.label} — ${my}`, req.user.org_id]);
        generated++;
      }
    }

    ok(res, { generated, skipped, message: `Generated ${generated} service charge invoices` });
  } catch(e) { safeErr(res, e); }
};

// POST /api/service-charges/meter-reading
// Body: { property_id, charge_type, reading_date, units_consumed, unit_rate, month_year }
// Splits total amount equally across all occupied units
exports.addMeterReading = async (req, res) => {
  try {
    const { property_id, charge_type, reading_date, units_consumed, unit_rate, month_year, notes } = req.body;
    if (!property_id || !charge_type || !units_consumed || !unit_rate)
      return err(res, 'property_id, charge_type, units_consumed and unit_rate required');
    // SECURITY FIX: no org check — see getRates() above.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);

    const total = parseFloat(units_consumed) * parseFloat(unit_rate);
    const my = month_year || new Date().toISOString().slice(0,7);

    // Save reading
    const [r] = await pool.query(
      'INSERT INTO meter_readings (property_id,charge_type,reading_date,units_consumed,unit_rate,total_amount,month_year,notes,recorded_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [property_id, charge_type, reading_date||new Date().toISOString().split('T')[0],
       units_consumed, unit_rate, total, my, notes||null, req.user.sub]);

    // Get active tenancies count (for splitting)
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM tenancies ten JOIN units un ON ten.unit_id=un.id WHERE un.property_id=? AND ten.status=\'active\'',
      [property_id]);
    if (!count) return ok(res, { reading_id: r.insertId, per_unit: 0, total, message: 'Reading saved. No active tenancies to bill.' });

    const perUnit = parseFloat((total / count).toFixed(2));
    const [yr, mo] = my.split('-');
    const dueDate = new Date(parseInt(yr), parseInt(mo), 0).toISOString().split('T')[0];

    // Create invoices for each tenancy
    const [tenancies] = await pool.query(
      'SELECT ten.id FROM tenancies ten JOIN units un ON ten.unit_id=un.id WHERE un.property_id=? AND ten.status=\'active\'',
      [property_id]);

    let generated = 0;
    for (const ten of tenancies) {
      const [[ex]] = await pool.query(
        'SELECT id FROM invoices WHERE tenancy_id=? AND type=? AND month_year=?',
        [ten.id, charge_type, my]);
      if (ex) continue;
      // BUG FIX: same missing org_id as generateServiceCharges above —
      // this silently defaulted every meter-reading invoice to org_id=1.
      await pool.query(
        'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,month_year,notes,org_id) VALUES (?,?,?,?,?,?,?,?)',
        [ten.id, charge_type, perUnit, perUnit, dueDate, my,
         `${charge_type} (shared meter) — ${units_consumed} units @ KES ${unit_rate}/unit ÷ ${count} units`,
         req.user.org_id]);
      generated++;
    }

    ok(res, { reading_id: r.insertId, total, per_unit: perUnit, count, generated });
  } catch(e) { safeErr(res, e); }
};


// ══════════════════════════════════════════════════════════════
// RENT ROLL REPORT
// ══════════════════════════════════════════════════════════════

// GET /api/reports/rent-roll?property_id=1&month_year=2024-03
exports.rentRoll = async (req, res) => {
  try {
    const pid  = req.query.property_id;
    const my   = req.query.month_year || new Date().toISOString().slice(0,7);
    // SECURITY FIX: no org check at all — WHERE 1=1 meant any manager
    // could pull the full rent roll (tenant names, phones, balances)
    // across every organisation on the platform, not just their own.
    // Also fixes a pre-existing param-count/order bug: the WHERE clause
    // placeholder order is [property_id?, org_id], but this must come
    // AFTER the two YEAR/MONTH pairs used in the SELECT list.
    const pf   = pid ? ' AND un.property_id=? AND pr.org_id=?' : ' AND pr.org_id=?';
    const yr = my.slice(0,4), mo = my.slice(5,7);
    const whereParams = pid ? [pid, req.user.org_id] : [req.user.org_id];

    const [rows] = await pool.query(`
      SELECT
        un.unit_number, un.type AS unit_type, un.status AS unit_status,
        pr.name AS property_name,
        COALESCE(u.full_name,'—') AS tenant_name,
        COALESCE(u.phone,'—') AS tenant_phone,
        ten.rent_amount, ten.start_date, ten.end_date, ten.access_status,
        COALESCE(SUM(CASE WHEN i.type='rent' AND YEAR(i.created_at)=? AND MONTH(i.created_at)=? THEN i.amount END),0) AS invoiced,
        COALESCE(SUM(CASE WHEN py.paid_at IS NOT NULL AND YEAR(py.paid_at)=? AND MONTH(py.paid_at)=? THEN py.amount END),0) AS paid_this_month,
        COALESCE(SUM(CASE WHEN i.status IN('unpaid','overdue','partial') THEN i.balance END),0) AS outstanding_balance,
        MIN(CASE WHEN i.status IN('unpaid','overdue') THEN i.due_date END) AS oldest_due,
        DATEDIFF(CURDATE(), MIN(CASE WHEN i.status='overdue' THEN i.due_date END)) AS days_overdue
      FROM units un
      JOIN properties pr ON un.property_id=pr.id
      LEFT JOIN tenancies ten ON un.id=ten.unit_id AND ten.status='active'
      LEFT JOIN tenants t ON ten.tenant_id=t.id
      LEFT JOIN users u ON t.user_id=u.id
      LEFT JOIN invoices i ON ten.id=i.tenancy_id
      LEFT JOIN payments py ON py.tenancy_id=ten.id
      WHERE 1=1 ${pf}
      GROUP BY un.id, un.unit_number, un.type, un.status, pr.name,
               u.full_name, u.phone, ten.rent_amount, ten.start_date,
               ten.end_date, ten.access_status
      ORDER BY pr.name, un.unit_number`,
      [yr, mo, yr, mo, ...whereParams]);

    // Totals
    const totals = rows.reduce((acc, r) => {
      acc.total_rent   += Number(r.rent_amount||0);
      acc.total_invoiced += Number(r.invoiced||0);
      acc.total_paid   += Number(r.paid_this_month||0);
      acc.total_outstanding += Number(r.outstanding_balance||0);
      return acc;
    }, { total_rent:0, total_invoiced:0, total_paid:0, total_outstanding:0 });

    ok(res, { rent_roll: rows, totals, month_year: my });
  } catch(e) { safeErr(res, e); }
};


// ══════════════════════════════════════════════════════════════
// VEHICLE LOOKUP AT GATE
// ══════════════════════════════════════════════════════════════

// GET /api/security/vehicle-lookup?plate=KBZ123A
exports.vehicleLookup = async (req, res) => {
  try {
    const plate = (req.query.plate || '').trim().toUpperCase();
    if (!plate || plate.length < 3) return err(res, 'Enter at least 3 characters of the plate number');

    // SECURITY FIX: no org check at all — a security guard or caretaker
    // could look up any tenant's vehicle/plate/phone/outstanding-balance
    // info across every organisation on the platform, not just their own.
    // Check tenants table
    const [tenants] = await pool.query(`
      SELECT u.full_name, u.phone, un.unit_number, pr.name AS property_name,
             ten.access_status, ten.access_restricted_reason, ten.rent_amount,
             COALESCE(SUM(CASE WHEN i.status IN('unpaid','overdue','partial') THEN i.balance END),0) AS outstanding,
             pa.slot_number AS parking_slot, t.vehicle_plate
      FROM tenants t
      JOIN users u ON t.user_id=u.id
      LEFT JOIN tenancies ten ON t.id=ten.tenant_id AND ten.status='active'
      LEFT JOIN units un ON ten.unit_id=un.id
      LEFT JOIN properties pr ON un.property_id=pr.id
      LEFT JOIN invoices i ON ten.id=i.tenancy_id
      LEFT JOIN parking_allocations pa ON pa.tenant_id=t.id
      WHERE (t.vehicle_plate LIKE ? OR t.vehicle_plate LIKE ?) AND t.org_id=?
      GROUP BY t.id`,
      [`%${plate}%`, `${plate}%`, req.user.org_id]);

    // Also check parking allocations
    const [parked] = await pool.query(`
      SELECT u.full_name, u.phone, un.unit_number, pr.name AS property_name,
             ten.access_status, pa.vehicle_number AS vehicle_plate, pa.slot_number AS parking_slot,
             COALESCE(SUM(CASE WHEN i.status IN('unpaid','overdue','partial') THEN i.balance END),0) AS outstanding
      FROM parking_allocations pa
      JOIN tenants t ON pa.tenant_id=t.id
      JOIN users u ON t.user_id=u.id
      LEFT JOIN tenancies ten ON t.id=ten.tenant_id AND ten.status='active'
      LEFT JOIN units un ON ten.unit_id=un.id
      LEFT JOIN properties pr ON un.property_id=pr.id
      LEFT JOIN invoices i ON ten.id=i.tenancy_id
      WHERE pa.vehicle_number LIKE ? AND t.org_id=?
      GROUP BY pa.id`,
      [`%${plate}%`, req.user.org_id]);

    const results = [...tenants, ...parked].reduce((acc, r) => {
      if (!acc.find(x => x.unit_number === r.unit_number)) acc.push(r);
      return acc;
    }, []);

    // Log the lookup
    await pool.query(
      'INSERT INTO access_log (event_type,notes,recorded_by,created_at) VALUES (?,?,?,NOW())',
      ['vehicle_lookup', `Plate lookup: ${plate}`, req.user.sub]).catch(()=>{});

    ok(res, { results, plate, found: results.length > 0 });
  } catch(e) { safeErr(res, e); }
};


// ══════════════════════════════════════════════════════════════
// BULK IMPORT
// ══════════════════════════════════════════════════════════════

// POST /api/import/tenants
// Body: { rows: [{full_name, phone, email, unit_number, property_name, rent_amount, start_date}] }
exports.bulkImportTenants = async (req, res) => {
  try {
    const { rows, dry_run } = req.body;
    if (!Array.isArray(rows) || !rows.length) return err(res, 'rows array required');
    // GUARD: an unbounded array here means a single request can hold a DB
    // connection for as long as it takes to process every row serially
    // (each with several round-trips) — a resource-exhaustion risk, not
    // just a slow request. invoices.js's bulkGenerate already caps at
    // 2000 active tenancies for the same reason; this endpoint had no
    // equivalent limit at all.
    if (rows.length > 500) return err(res, 'Batch size exceeds the maximum of 500 rows per import');

    const results = { imported: 0, skipped: 0, errors: [] };
    const conn = await pool.getConnection();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      try {
        // Validate required fields
        if (!row.full_name) { results.errors.push({ row: rowNum, error: 'full_name required' }); results.skipped++; continue; }
        if (!row.phone)     { results.errors.push({ row: rowNum, error: 'phone required' });     results.skipped++; continue; }

        if (dry_run) { results.imported++; continue; } // preview mode

        // Find unit
        // SECURITY/DATA FIX: none of the inserts below set org_id, so
        // every imported user/tenant/tenancy silently fell back to the
        // column's DEFAULT 1 (from the org_id migration) regardless of
        // which organisation's super_admin ran the import — an org other
        // than org 1 running this would corrupt its own data into org 1.
        // Also scoped the unit lookup to the importing admin's org so it
        // can't accidentally attach a tenancy to another org's unit.
        let unit_id = null;
        if (row.unit_number && row.property_name) {
          const [[unit]] = await conn.query(
            'SELECT un.id FROM units un JOIN properties p ON un.property_id=p.id WHERE un.unit_number=? AND p.name LIKE ? AND p.org_id=?',
            [row.unit_number, `%${row.property_name}%`, req.user.org_id]);
          if (unit) unit_id = unit.id;
        }

        // Check duplicate phone
        const [[existing]] = await conn.query('SELECT id FROM users WHERE phone=? AND org_id=?', [row.phone, req.user.org_id]);
        let user_id;
        if (existing) {
          user_id = existing.id;
        } else {
          // Create user
          const bcrypt = require('bcryptjs');
          const defaultPw = await bcrypt.hash(row.phone.slice(-4), 10); // last 4 digits as default password
          const [ur] = await conn.query(
            'INSERT INTO users (full_name,email,phone,password_hash,role,org_id,is_active) VALUES (?,?,?,?,?,?,1)',
            [row.full_name, row.email||null, row.phone, defaultPw, 'tenant', req.user.org_id]);
          user_id = ur.insertId;

          // Create tenant record
          await conn.query(
            'INSERT INTO tenants (user_id,id_number,org_id) VALUES (?,?,?)',
            [user_id, row.id_number||null, req.user.org_id]);
        }

        // Create tenancy if unit found
        if (unit_id && row.rent_amount) {
          const [[tenantRec]] = await conn.query('SELECT id FROM tenants WHERE user_id=?', [user_id]);
          if (tenantRec) {
            const [[existTen]] = await conn.query(
              'SELECT id FROM tenancies WHERE tenant_id=? AND unit_id=? AND status=\'active\'',
              [tenantRec.id, unit_id]);
            if (!existTen) {
              await conn.query(
                'INSERT INTO tenancies (tenant_id,unit_id,start_date,rent_amount,deposit,status,org_id) VALUES (?,?,?,?,?,?,?)',
                [tenantRec.id, unit_id, row.start_date||new Date().toISOString().split('T')[0],
                 row.rent_amount, row.deposit||row.rent_amount, 'active', req.user.org_id]);
              await conn.query('UPDATE units SET status=\'occupied\' WHERE id=?', [unit_id]);
            }
          }
        }

        results.imported++;
      } catch (rowErr) {
        results.errors.push({ row: rowNum, error: rowErr.message });
        results.skipped++;
      }
    }

    conn.release();

    // Log import
    await pool.query(
      'INSERT INTO import_logs (import_type,total_rows,imported,skipped,errors,imported_by) VALUES (?,?,?,?,?,?)',
      ['tenants', rows.length, results.imported, results.skipped, JSON.stringify(results.errors), req.user.sub]
    ).catch(()=>{});

    ok(res, { ...results, total: rows.length, dry_run: !!dry_run });
  } catch(e) { safeErr(res, e); }
};