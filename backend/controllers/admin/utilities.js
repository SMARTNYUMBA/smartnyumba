const pool = require('../../config/db');
const { ok, err, safeErr } = require("../../utils/helpers");

exports.getAll = async (req, res) => {
  try {
    let sql = 'SELECT r.*,u.unit_number,pr.name AS property_name FROM utility_readings r JOIN units u ON r.unit_id=u.id JOIN properties pr ON u.property_id=pr.id WHERE pr.org_id=?';
    const params = [req.user.org_id]; // SECURITY FIX: no org filter previously.
    if (req.query.unit_id) { sql += ' AND r.unit_id=?'; params.push(req.query.unit_id); }
    if (req.query.type)    { sql += ' AND r.utility_type=?'; params.push(req.query.type); }
    // Property scoping
    if (req.user.role === 'property_manager') {
      sql += ' AND pr.manager_id=?'; params.push(req.user.sub);
    } else if (req.user.property_id) {
      sql += ' AND u.property_id=?'; params.push(req.user.property_id);
    }
    sql += ' ORDER BY r.reading_date DESC LIMIT 50';
    const [rows] = await pool.query(sql, params);
    ok(res, { readings: rows });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { unit_id,utility_type,current_reading,reading_date,previous_reading,generate_invoice,tenancy_id,due_date } = req.body;
    if (!unit_id||!utility_type||current_reading===undefined||!reading_date) return err(res, 'unit_id, utility_type, current_reading and reading_date required');
    // SECURITY FIX: unit_id came from the request body unvalidated —
    // could log a utility reading against another organisation's unit.
    const [[unitCheck]] = await pool.query('SELECT id FROM units WHERE id=? AND org_id=?', [unit_id, req.user.org_id]);
    if (!unitCheck) return err(res, 'Unit not found', 404);
    // tenancy_id is used to generate a real invoice below — also unvalidated before.
    if (tenancy_id) {
      const [[tenCheck]] = await pool.query('SELECT id FROM tenancies WHERE id=? AND org_id=?', [tenancy_id, req.user.org_id]);
      if (!tenCheck) return err(res, 'Tenancy not found', 404);
    }
    const [settings] = await pool.query("SELECT setting_key,setting_value FROM settings WHERE setting_key IN('water_rate','electricity_rate')");
    const rates = Object.fromEntries(settings.map(s=>[s.setting_key,s.setting_value]));
    const rate = utility_type==='water' ? parseFloat(rates.water_rate||80) : parseFloat(rates.electricity_rate||25);
    const prev_r = parseFloat(previous_reading||0);
    const curr_r = parseFloat(current_reading);
    // FIX: units_consumed and total_amount were never computed or inserted,
    // so they sat at their DEFAULT 0 — the code then read back a non-existent
    // `rd.amount` column (real name: total_amount), which meant invoices were
    // never generated no matter what readings were entered.
    const unitsConsumed = Math.max(curr_r - prev_r, 0);
    const totalAmount = parseFloat((unitsConsumed * rate).toFixed(2));
    const [r] = await pool.query('INSERT INTO utility_readings (unit_id,utility_type,previous_reading,current_reading,units_consumed,rate_per_unit,total_amount,reading_date,read_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [unit_id, utility_type, prev_r, curr_r, unitsConsumed, rate, totalAmount, reading_date, req.user.sub]);
    const [[rd]] = await pool.query('SELECT * FROM utility_readings WHERE id=?', [r.insertId]);
    let invoice_id = null;
    if (generate_invoice && tenancy_id && parseFloat(rd.total_amount) > 0) {
      const [ir] = await pool.query('INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,org_id) VALUES (?,?,?,?,?,?)',
        [tenancy_id, utility_type, rd.total_amount, rd.total_amount, due_date||new Date(Date.now()+7*86400000).toISOString().split('T')[0], req.user.org_id]);
      invoice_id = ir.insertId;
      await pool.query('UPDATE utility_readings SET invoice_id=? WHERE id=?', [invoice_id, r.insertId]);
    }
    ok(res, { id: r.insertId, amount: rd.total_amount, units_consumed: rd.units_consumed, invoice_id }, 201);
  } catch(e) { safeErr(res, e); }
};

// FEATURE: GET /api/meter-readings/pending — previously called by
// pages/caretaker/Dashboard.jsx but never implemented anywhere in the
// backend (404, silently swallowed to an empty list). "Pending" is
// defined here as: occupied units, in properties the caller is scoped
// to, that have had no utility reading of any type recorded so far this
// calendar month. That mirrors how readings are actually taken in this
// app — one entry per unit per billing cycle via this same
// utility_readings table (see exports.create above) — rather than
// tracking per-utility-type schedules, which nothing else in the app
// currently models.
exports.getPending = async (req, res) => {
  try {
    let sql = `
      SELECT u.id AS unit_id, u.unit_number, pr.id AS property_id, pr.name AS property_name,
        (SELECT MAX(reading_date) FROM utility_readings ur WHERE ur.unit_id=u.id) AS last_reading_date
      FROM units u
      JOIN properties pr ON u.property_id=pr.id
      WHERE pr.org_id=? AND u.status='occupied'
        AND NOT EXISTS (
          SELECT 1 FROM utility_readings ur
          WHERE ur.unit_id=u.id
            AND ur.reading_date >= DATE_FORMAT(CURDATE(),'%Y-%m-01')
        )`;
    const params = [req.user.org_id];
    if (req.user.role === 'property_manager') {
      sql += ' AND pr.manager_id=?'; params.push(req.user.sub);
    } else if (req.user.property_id) {
      sql += ' AND u.property_id=?'; params.push(req.user.property_id);
    }
    if (req.query.property_id) { sql += ' AND pr.id=?'; params.push(req.query.property_id); }
    sql += ' ORDER BY pr.name, u.unit_number';
    const [pending] = await pool.query(sql, params);
    ok(res, { pending });
  } catch(e) { safeErr(res, e); }
};
