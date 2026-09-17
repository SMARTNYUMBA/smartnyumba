const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/utilities');

// Admin / manager / caretaker — view and create readings
router.get('/',  auth(['super_admin','property_manager','caretaker']), c.getAll);
router.post('/', auth(['super_admin','property_manager','caretaker']), c.create);

// Tenant — view own unit's readings only
router.get('/my', auth(['tenant']), async (req, res) => {
  const pool = require('../config/db');
  const { ok, err } = require('../utils/helpers');
  try {
    const [[tenancy]] = await pool.query(
      `SELECT ten.id, ten.unit_id, un.unit_number, pr.name AS property_name
       FROM tenants t
       JOIN tenancies ten ON t.id = ten.tenant_id AND ten.status = 'active'
       JOIN units un ON ten.unit_id = un.id
       JOIN properties pr ON un.property_id = pr.id
       WHERE t.user_id = ? LIMIT 1`, [req.user.sub]);

    if (!tenancy) return ok(res, { readings: [], unit: null });

    const [readings] = await pool.query(
      `SELECT r.*, un.unit_number
       FROM utility_readings r
       JOIN units un ON r.unit_id = un.id
       WHERE r.unit_id = ?
       ORDER BY r.reading_date DESC LIMIT 24`,
      [tenancy.unit_id]);

    ok(res, { readings, unit: { unit_number: tenancy.unit_number, property_name: tenancy.property_name } });
  } catch (e) { err(res, e.message, 500); }
});

module.exports = router;
