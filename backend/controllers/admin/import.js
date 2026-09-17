'use strict';

/**
 * SmartNyumba Pro — Bulk Import Controller
 *
 * POST /api/import/validate  — dry-run: parse file, return preview + errors
 * POST /api/import/commit    — actually insert validated rows into DB
 * GET  /api/import/template  — download the Excel import template
 *
 * Supported import types (req.body.type):
 *   'tenants'  — tenant + unit + tenancy in one row
 *   'payments' — historical payment records
 */

const pool     = require('../../config/db');
const bcrypt   = require('bcryptjs');
const { ok, err, safeErr } = require('../../utils/helpers');

// ── Column maps ───────────────────────────────────────────────
const TENANT_COLS = [
  { key: 'full_name',          label: 'Full Name',              required: true  },
  { key: 'phone',              label: 'Phone (254...)',         required: true  },
  { key: 'email',              label: 'Email',                  required: false },
  { key: 'id_number',          label: 'ID Number',              required: false },
  { key: 'unit_number',        label: 'Unit Number',            required: true  },
  { key: 'property_name',      label: 'Property Name',          required: true  },
  { key: 'monthly_rent',       label: 'Monthly Rent (KES)',     required: true  },
  { key: 'deposit',            label: 'Deposit (KES)',          required: false },
  { key: 'move_in_date',       label: 'Move-in Date (YYYY-MM-DD)', required: true },
  { key: 'emergency_contact',  label: 'Emergency Contact Name', required: false },
  { key: 'emergency_phone',    label: 'Emergency Contact Phone',required: false },
];

const PAYMENT_COLS = [
  { key: 'tenant_phone',  label: 'Tenant Phone',         required: true  },
  { key: 'amount',        label: 'Amount (KES)',         required: true  },
  { key: 'paid_date',     label: 'Payment Date (YYYY-MM-DD)', required: true },
  { key: 'method',        label: 'Method (mpesa/cash/bank)', required: false },
  { key: 'reference',     label: 'Reference / Txn Code', required: false },
  { key: 'notes',         label: 'Notes',                required: false },
];

// ── Parse uploaded CSV/XLSX ───────────────────────────────────
function parseCSV(buffer) {
  const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };

  const parseRow = (line) => {
    const cols = []; let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  const rows    = lines.slice(1).map((line, i) => {
    const vals = parseRow(line);
    const row  = { _row: i + 2 };
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v && v !== '_row'));

  return { headers, rows };
}

function parseXLSX(buffer) {
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    const rows = raw.map((r, i) => {
      const normalised = { _row: i + 2 };
      for (const [k, v] of Object.entries(r)) {
        const key = k.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        normalised[key] = String(v || '').trim();
      }
      return normalised;
    });
    const headers = rows.length ? Object.keys(rows[0]).filter(k => k !== '_row') : [];
    return { headers, rows };
  } catch {
    throw new Error('Could not parse XLSX file. Ensure it is a valid Excel (.xlsx) file.');
  }
}

// ── Validation helpers ────────────────────────────────────────
function validatePhone(phone) {
  const clean = String(phone).replace(/\s+|-|\+/g, '');
  if (/^254\d{9}$/.test(clean)) return clean;
  if (/^07\d{8}$/.test(clean))  return '254' + clean.slice(1);
  if (/^01\d{8}$/.test(clean))  return '254' + clean.slice(1);
  return null;
}

function validateDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ── Validate tenant rows ──────────────────────────────────────
async function validateTenantRows(rows, org_id) {
  // Pre-load properties and units for this org
  const [properties] = await pool.query(
    'SELECT id, name FROM properties WHERE org_id=?', [org_id]
  );
  const [units] = await pool.query(
    `SELECT u.id, u.unit_number, p.name AS property_name, p.id AS property_id
     FROM units u JOIN properties p ON p.id=u.property_id WHERE p.org_id=?`, [org_id]
  );
  const [existingPhones] = await pool.query(
    'SELECT phone FROM tenants WHERE org_id=?', [org_id]
  );
  const usedPhones = new Set(existingPhones.map(t => t.phone));

  const propMap  = new Map(properties.map(p => [p.name.toLowerCase(), p]));
  const unitMap  = new Map(units.map(u => [`${u.property_name.toLowerCase()}::${u.unit_number.toLowerCase()}`, u]));

  const results = [];
  for (const row of rows) {
    const errors = [];
    const warnings = [];

    if (!row.full_name?.trim())   errors.push('Full Name is required');
    const phone = validatePhone(row.phone);
    if (!phone)                   errors.push(`Phone "${row.phone}" is not a valid Kenyan number`);
    else if (usedPhones.has(phone)) warnings.push('Phone already exists — tenant will be updated');
    if (!row.unit_number?.trim()) errors.push('Unit Number is required');
    if (!row.property_name?.trim()) errors.push('Property Name is required');

    const rent = parseFloat(row.monthly_rent);
    if (isNaN(rent) || rent <= 0) errors.push('Monthly Rent must be a positive number');

    const moveIn = validateDate(row.move_in_date);
    if (!moveIn) errors.push(`Move-in Date "${row.move_in_date}" is not a valid date (use YYYY-MM-DD)`);

    // Match property
    const prop = propMap.get(row.property_name?.toLowerCase());
    if (!prop) errors.push(`Property "${row.property_name}" not found. Create it in Properties first.`);

    // Match unit
    const unitKey = `${row.property_name?.toLowerCase()}::${row.unit_number?.toLowerCase()}`;
    const unit = unitMap.get(unitKey);
    if (prop && !unit) errors.push(`Unit "${row.unit_number}" not found in property "${row.property_name}". Create it in Units first.`);

    results.push({
      _row: row._row,
      data: { full_name: row.full_name, phone, email: row.email, id_number: row.id_number,
              unit_number: row.unit_number, property_name: row.property_name,
              monthly_rent: rent, deposit: parseFloat(row.deposit) || 0,
              move_in_date: moveIn, emergency_contact: row.emergency_contact,
              emergency_phone: row.emergency_phone,
              _unit_id: unit?.id, _property_id: prop?.id },
      errors,
      warnings,
      valid: errors.length === 0,
    });
  }
  return results;
}

// ── Commit tenant rows ────────────────────────────────────────
async function commitTenantRows(validatedRows, org_id, imported_by) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  const created = []; const updated = [];
  try {
    for (const { data } of validatedRows) {
      // Upsert tenant
      // FIX: full_name, phone, and email live on `users`, not `tenants` —
      // `tenants` only has user_id, id_number, emergency_contact,
      // emergency_phone (+org_id). All three queries below previously
      // referenced columns that don't exist on `tenants` and would have
      // thrown ER_BAD_FIELD_ERROR on every single imported row.
      const [[existing]] = await conn.query(
        'SELECT t.id, t.user_id FROM tenants t JOIN users u ON t.user_id=u.id WHERE u.phone=? AND t.org_id=?',
        [data.phone, org_id]);
      let tenant_id;
      if (existing) {
        await conn.query(
          'UPDATE users SET full_name=?,email=?,updated_at=NOW() WHERE id=?',
          [data.full_name, data.email, existing.user_id]
        );
        await conn.query(
          'UPDATE tenants SET id_number=?,emergency_contact=?,emergency_phone=? WHERE id=?',
          [data.id_number, data.emergency_contact, data.emergency_phone, existing.id]
        );
        tenant_id = existing.id;
        updated.push(data.full_name);
      } else {
        // Create tenant + linked user account
        const hash = await bcrypt.hash(data.phone.slice(-4), 12); // default password = last 4 digits of phone
        const [tu] = await conn.query(
          'INSERT INTO users (full_name,email,phone,password_hash,role,org_id,is_active) VALUES (?,?,?,?,?,?,1)',
          [data.full_name, data.email||null, data.phone, hash, 'tenant', org_id]
        );
        const [tt] = await conn.query(
          `INSERT INTO tenants (user_id, id_number,
            emergency_contact, emergency_phone, org_id)
           VALUES (?,?,?,?,?)`,
          [tu.insertId, data.id_number||null,
           data.emergency_contact||null, data.emergency_phone||null, org_id]
        );
        tenant_id = tt.insertId;
        created.push(data.full_name);
      }

      // Ensure tenancy exists
      const [[activeTenancy]] = await conn.query(
        "SELECT id FROM tenancies WHERE tenant_id=? AND unit_id=? AND status='active'",
        [tenant_id, data._unit_id]
      );
      if (!activeTenancy) {
        // FIX: tenancies has no property_id column (property is reached via
        // unit_id -> units.property_id) and the rent column is rent_amount,
        // not monthly_rent — this insert was throwing ER_BAD_FIELD_ERROR.
        await conn.query(
          `INSERT INTO tenancies (tenant_id, unit_id, rent_amount,
            deposit, start_date, status, org_id)
           VALUES (?,?,?,?,?,?,?)`,
          [tenant_id, data._unit_id, data.monthly_rent,
           data.deposit, data.move_in_date, 'active', org_id]
        );
        await conn.query("UPDATE units SET status='occupied' WHERE id=?", [data._unit_id]);
      }
    }
    await conn.commit();
    return { created: created.length, updated: updated.length };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── Route handlers ────────────────────────────────────────────

/** GET /api/import/template?type=tenants */
exports.template = (req, res) => {
  const type  = req.query.type === 'payments' ? 'payments' : 'tenants';
  const cols  = type === 'payments' ? PAYMENT_COLS : TENANT_COLS;

  try {
    const XLSX = require('xlsx');
    const headers = cols.map(c => c.label);
    const example = type === 'tenants'
      ? [['John Kamau', '0712345678', 'john@email.com', '12345678', 'A1', 'Sunshine Apartments', '12000', '24000', '2024-01-01', 'Jane Kamau', '0798765432']]
      : [['0712345678', '12000', '2024-01-15', 'mpesa', 'QBC123DEF', 'January rent']];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="snp_${type}_import_template.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch {
    // Fallback: CSV
    const cols2 = type === 'payments' ? PAYMENT_COLS : TENANT_COLS;
    const csv  = cols2.map(c => c.label).join(',') + '\n';
    res.setHeader('Content-Disposition', `attachment; filename="snp_${type}_import_template.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  }
};

/** POST /api/import/validate */
exports.validate = async (req, res) => {
  try {
    if (!req.file) return err(res, 'No file uploaded');
    const type    = req.body.type || 'tenants';
    const buffer  = req.file.buffer;
    const isCsv   = req.file.originalname.endsWith('.csv');

    const { rows } = isCsv ? parseCSV(buffer) : parseXLSX(buffer);
    if (!rows.length) return err(res, 'File is empty or contains no data rows');
    if (rows.length > 500) return err(res, 'Maximum 500 rows per import. Split your file into batches.');

    let results;
    if (type === 'tenants') {
      results = await validateTenantRows(rows, req.user.org_id);
    } else {
      return err(res, 'Payment import coming soon');
    }

    const valid   = results.filter(r => r.valid).length;
    const invalid = results.filter(r => !r.valid).length;

    ok(res, {
      total: results.length, valid, invalid,
      rows: results.map(r => ({ row: r._row, data: r.data, errors: r.errors, warnings: r.warnings, valid: r.valid })),
      can_commit: valid > 0,
    });
  } catch(e) { safeErr(res, e); }
};

/** POST /api/import/commit */
exports.commit = async (req, res) => {
  try {
    const { type, rows } = req.body;
    if (!rows?.length) return err(res, 'No rows to import');
    const validRows = rows.filter(r => r.valid);
    if (!validRows.length) return err(res, 'No valid rows to import');

    let result;
    if (type === 'tenants') {
      result = await commitTenantRows(validRows, req.user.org_id, req.user.sub);
    } else {
      return err(res, 'Payment import coming soon');
    }

    ok(res, { ...result, message: `Import complete: ${result.created} created, ${result.updated} updated.` });
  } catch(e) { safeErr(res, e); }
};
