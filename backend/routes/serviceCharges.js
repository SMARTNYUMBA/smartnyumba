'use strict';

const router = require('express').Router();
const auth   = require('../middleware/auth');
const pool   = require('../config/db');

// ARCHITECTURAL NOTE: controllers/admin/enterprise.js has a second,
// functionally-overlapping implementation of rate management, charge
// generation, and meter-reading billing (mounted at
// /api/enterprise/service-charges via routes/enterprise.js). This file
// is the one the actual frontend calls (see frontend/src/pages/admin/
// ServiceCharges.jsx and api.js) — the other isn't called by this
// repo's UI, but IS live and mounted, so it wasn't deleted. Both were
// independently found to have the same missing-org_id bug this session
// and both were fixed — if you change the billing logic here (rate
// calculation, invoice fields, org/property scoping), check
// enterprise.js's generateServiceCharges/addMeterReading too, or they
// will silently drift apart again.

const ROLES = ['super_admin', 'property_manager'];

// SECURITY FIX (whole file): none of these endpoints checked that the
// property_id in the request actually belonged to the caller's org — a
// property_manager could view/edit another organisation's service charge
// rates by ID, and (worse) POST /generate and POST /meter-reading would
// happily create real invoice records against another organisation's
// tenants just by supplying their property_id. Added a shared helper that
// verifies property ownership (and, for property_manager, that it's one
// of their own managed properties) before any of these run.
async function assertOwnsProperty(req, property_id) {
  const [[prop]] = await pool.query('SELECT id, manager_id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
  if (!prop) return false;
  if (req.user.role === 'property_manager' && prop.manager_id !== req.user.sub) return false;
  return true;
}

// ── GET all rates for a property ─────────────────────────────
router.get('/', auth(ROLES), async (req, res) => {
  try {
    const { property_id } = req.query;
    let sql = `SELECT scr.* FROM service_charge_rates scr
      JOIN properties p ON scr.property_id = p.id WHERE p.org_id=?`;
    const params = [req.user.org_id];
    if (property_id) { sql += ' AND scr.property_id=?'; params.push(property_id); }
    if (req.user.role === 'property_manager') { sql += ' AND p.manager_id=?'; params.push(req.user.sub); }
    sql += ' ORDER BY scr.charge_type, scr.created_at DESC';
    const [rows] = await pool.query(sql, params).catch(() => [[]]);
    res.json({ rates: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET rates sub-path ────────────────────────────────────────
router.get('/rates', auth(ROLES), async (req, res) => {
  try {
    const { property_id } = req.query;
    let sql = `SELECT scr.* FROM service_charge_rates scr
      JOIN properties p ON scr.property_id = p.id WHERE scr.is_active=1 AND p.org_id=?`;
    const params = [req.user.org_id];
    if (property_id) { sql += ' AND scr.property_id=?'; params.push(property_id); }
    if (req.user.role === 'property_manager') { sql += ' AND p.manager_id=?'; params.push(req.user.sub); }
    sql += ' ORDER BY scr.charge_type';
    const [rows] = await pool.query(sql, params).catch(() => [[]]);
    res.json({ rates: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST create/update rate ───────────────────────────────────
router.post('/rates', auth(ROLES), async (req, res) => {
  try {
    // Auto-create table if missing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_charge_rates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        property_id INT NOT NULL,
        charge_type VARCHAR(50) NOT NULL,
        label VARCHAR(100) NOT NULL,
        billing_method ENUM('fixed','per_unit','shared_meter') DEFAULT 'fixed',
        amount DECIMAL(12,2) DEFAULT 0,
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_property (property_id)
      )`).catch(() => {});

    const { id, property_id, charge_type, label, billing_method, amount, is_active } = req.body;

    if (id) {
      // Updating an existing rate — resolve its property from the row
      // itself so we can verify ownership before touching it.
      const [[existing]] = await pool.query(
        `SELECT scr.id, p.org_id, p.manager_id FROM service_charge_rates scr
         JOIN properties p ON scr.property_id = p.id WHERE scr.id=?`, [id]);
      if (!existing || existing.org_id !== req.user.org_id) return res.status(404).json({ error: 'Rate not found' });
      if (req.user.role === 'property_manager' && existing.manager_id !== req.user.sub) return res.status(404).json({ error: 'Rate not found' });
      await pool.query('UPDATE service_charge_rates SET charge_type=?,label=?,billing_method=?,amount=?,is_active=? WHERE id=?',
        [charge_type, label, billing_method||'fixed', amount||0, is_active??1, id]);
      return res.json({ id, message: 'Rate updated' });
    }

    if (!property_id || !charge_type || !label) return res.status(400).json({ error: 'property_id, charge_type and label required' });
    if (!(await assertOwnsProperty(req, property_id))) return res.status(404).json({ error: 'Property not found' });

    const [r] = await pool.query('INSERT INTO service_charge_rates (property_id,charge_type,label,billing_method,amount,is_active) VALUES (?,?,?,?,?,?)',
      [property_id, charge_type, label, billing_method||'fixed', amount||0, is_active??1]);
    res.status(201).json({ id: r.insertId, message: 'Rate created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST generate invoices for all active tenancies ───────────
router.post('/generate', auth(ROLES), async (req, res) => {
  try {
    const { property_id, month_year, charge_types } = req.body;
    if (!property_id || !month_year) return res.status(400).json({ error: 'property_id and month_year required' });
    if (!(await assertOwnsProperty(req, property_id))) return res.status(404).json({ error: 'Property not found' });

    // Get all active rates for the property
    let rateSql = 'SELECT * FROM service_charge_rates WHERE property_id=? AND is_active=1';
    const rateParams = [property_id];
    if (charge_types && charge_types.length) {
      rateSql += ' AND charge_type IN (' + charge_types.map(()=>'?').join(',') + ')';
      rateParams.push(...charge_types);
    }
    const [rates] = await pool.query(rateSql, rateParams).catch(() => [[]]);
    if (!rates.length) return res.json({ generated: 0, skipped: 0, message: 'No active rates found' });

    // Get active tenancies in property
    const [tenancies] = await pool.query(
      `SELECT ten.id FROM tenancies ten JOIN units u ON ten.unit_id=u.id
       WHERE u.property_id=? AND ten.status='active'`, [property_id]);

    let generated = 0, skipped = 0;
    const dueDate = month_year + '-28'; // Due end of month

    for (const ten of tenancies) {
      for (const rate of rates) {
        // Skip if already generated
        const [[ex]] = await pool.query(
          "SELECT id FROM invoices WHERE tenancy_id=? AND type=? AND month_year=? LIMIT 1",
          [ten.id, rate.charge_type, month_year]);
        if (ex) { skipped++; continue; }

        // BUG FIX: this INSERT never included org_id (NOT NULL DEFAULT 1
        // on that column), silently mis-filing every generated invoice
        // under org 1 regardless of the caller's real org. Safe to use
        // req.user.org_id directly — assertOwnsProperty() above already
        // verified this property belongs to it.
        await pool.query(
          'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,month_year,notes,org_id) VALUES (?,?,?,?,?,?,?,?)',
          [ten.id, rate.charge_type, rate.amount, rate.amount, dueDate, month_year, rate.label, req.user.org_id]);
        generated++;
      }
    }

    res.json({ generated, skipped, message: generated + ' invoices generated, ' + skipped + ' skipped (already existed)' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST shared meter reading ─────────────────────────────────
router.post('/meter-reading', auth(ROLES), async (req, res) => {
  try {
    const { property_id, charge_type, units_consumed, unit_rate, reading_date, month_year, notes } = req.body;
    if (!property_id || !units_consumed || !unit_rate) return res.status(400).json({ error: 'property_id, units_consumed and unit_rate required' });
    if (!(await assertOwnsProperty(req, property_id))) return res.status(404).json({ error: 'Property not found' });

    const totalBill = parseFloat(units_consumed) * parseFloat(unit_rate);

    // Get active tenancies in property
    const [tenancies] = await pool.query(
      `SELECT ten.id FROM tenancies ten JOIN units u ON ten.unit_id=u.id
       WHERE u.property_id=? AND ten.status='active'`, [property_id]);

    if (!tenancies.length) return res.json({ generated: 0, per_unit: 0, total: totalBill, count: 0 });

    const perUnit = totalBill / tenancies.length;
    const my = month_year || new Date().toISOString().slice(0, 7);
    const dueDate = my + '-28';
    const invoiceType = charge_type || 'water';
    let generated = 0;

    for (const ten of tenancies) {
      const [[ex]] = await pool.query(
        "SELECT id FROM invoices WHERE tenancy_id=? AND type=? AND month_year=? LIMIT 1",
        [ten.id, invoiceType, my]);
      if (ex) continue;
      // BUG FIX: same missing org_id as /generate above.
      await pool.query(
        'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,month_year,notes,org_id) VALUES (?,?,?,?,?,?,?,?)',
        [ten.id, invoiceType, perUnit.toFixed(2), perUnit.toFixed(2), dueDate, my, notes || (invoiceType + ' meter reading ' + reading_date), req.user.org_id]);
      generated++;
    }

    res.json({ generated, per_unit: perUnit, total: totalBill, count: tenancies.length, message: 'Meter reading saved, ' + generated + ' invoices created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
