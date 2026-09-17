const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    let sql = `
      SELECT sm.*,p.name AS property_name,COUNT(smu.id) AS unit_count
      FROM shared_meters sm JOIN properties p ON sm.property_id=p.id
      LEFT JOIN shared_meter_units smu ON sm.id=smu.meter_id
      WHERE p.org_id=?`;
    const params = [req.user.org_id]; // SECURITY FIX: previously a super_admin
    // saw shared meters across every organisation on the platform.
    // Scope: manager sees only their properties, caretaker/security only theirs
    if (req.user.role === 'property_manager') {
      sql += ' AND p.manager_id=?'; params.push(req.user.sub);
    } else if (['caretaker','security'].includes(req.user.role) && req.user.property_id) {
      sql += ' AND sm.property_id=?'; params.push(req.user.property_id);
    }
    sql += ' GROUP BY sm.id ORDER BY p.name,sm.name';
    const [meters] = await pool.query(sql, params);
    ok(res, { meters });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { property_id, name, utility_type, split_method, units } = req.body;
    if (!property_id||!name||!utility_type) return err(res, 'property_id, name and utility_type required');
    // SECURITY FIX: property_id came from the request body unvalidated —
    // could create a shared meter under another organisation's property.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const [r] = await conn.query(
        'INSERT INTO shared_meters (property_id,name,utility_type,split_method) VALUES (?,?,?,?)',
        [property_id, name, utility_type, split_method||'equal']);
      if (units?.length) {
        for (const u of units)
          await conn.query('INSERT INTO shared_meter_units (meter_id,unit_id,share_pct) VALUES (?,?,?)',
            [r.insertId, u.unit_id, u.share_pct||null]);
      }
      await conn.commit(); conn.release();
      ok(res, { id: r.insertId, message: 'Shared meter created' }, 201);
    } catch (e2) { await conn.rollback(); conn.release(); throw e2; }
  } catch(e) { safeErr(res, e); }
};

// Post a shared meter reading and split bills
exports.postReading = async (req, res) => {
  try {
    const { meter_id, current_reading, previous_reading, reading_date, generate_invoices, due_date } = req.body;
    if (!meter_id||current_reading===undefined||!reading_date) return err(res, 'meter_id, current_reading and reading_date required');

    // SECURITY FIX: no org check — anyone could post a reading against
    // another organisation's shared meter and (if generate_invoices was
    // set) create real invoices against that org's tenancies.
    // shared_meters has no org_id column of its own, scope via property.
    const [[meter]] = await pool.query(
      `SELECT sm.* FROM shared_meters sm JOIN properties p ON sm.property_id=p.id
       WHERE sm.id=? AND p.org_id=?`, [meter_id, req.user.org_id]);
    if (!meter) return err(res, 'Meter not found', 404);

    const [units] = await pool.query(`
      SELECT smu.*,u.id AS unit_id,u.unit_number,
        ten.id AS tenancy_id,ten.rent_amount
      FROM shared_meter_units smu JOIN units u ON smu.unit_id=u.id
      LEFT JOIN tenancies ten ON u.id=ten.unit_id AND ten.status='active'
      WHERE smu.meter_id=?`, [meter_id]);

    if (!units.length) return err(res, 'No units linked to this meter', 400);

    const [[settings]] = await pool.query(
      "SELECT setting_value FROM settings WHERE setting_key=?",
      [meter.utility_type === 'water' ? 'water_rate' : 'electricity_rate']);
    const rate = parseFloat(settings?.setting_value || 80);
    const prev = parseFloat(previous_reading || 0);
    const total_units = parseFloat(current_reading) - prev;
    const total_amount = total_units * rate;

    let splits = [];
    if (meter.split_method === 'equal') {
      const share = total_amount / units.length;
      splits = units.map(u => ({ ...u, share_amount: share }));
    } else if (meter.split_method === 'custom') {
      const total_pct = units.reduce((s,u) => s + parseFloat(u.share_pct||0), 0);
      splits = units.map(u => ({ ...u, share_amount: total_amount * (parseFloat(u.share_pct||0) / total_pct) }));
    } else {
      const share = total_amount / units.length;
      splits = units.map(u => ({ ...u, share_amount: share }));
    }

    let invoices_created = 0;
    if (generate_invoices) {
      const dd = due_date || new Date(Date.now()+7*86400000).toISOString().split('T')[0];
      for (const s of splits) {
        if (s.tenancy_id && s.share_amount > 0) {
          await pool.query(
            'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,org_id) VALUES (?,?,?,?,?,?)',
            [s.tenancy_id, meter.utility_type, s.share_amount.toFixed(2), s.share_amount.toFixed(2), dd, req.user.org_id]);
          invoices_created++;
        }
      }
    }

    ok(res, {
      total_units_consumed: total_units,
      total_amount,
      rate_per_unit: rate,
      split_method: meter.split_method,
      splits: splits.map(s => ({ unit: s.unit_number, tenancy_id: s.tenancy_id, amount: parseFloat(s.share_amount.toFixed(2)) })),
      invoices_created,
      message: `Bill split across ${units.length} units. ${invoices_created} invoices created.`
    });
  } catch(e) { safeErr(res, e); }
};
