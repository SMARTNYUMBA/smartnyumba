// backend/routes/tenancies.js  — FULL FILE (replace entirely)
const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const auth    = require('../middleware/auth');
const c       = require('../controllers/admin/tenancies');
const renew   = require('../controllers/admin/tenancies_renew');
const deposit = require('../controllers/admin/deposit_refund');

// Lease document upload setup
const leaseStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/leases');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) =>
    cb(null, `lease-${req.params.id}-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage: leaseStorage, limits: { fileSize: 10 * 1024 * 1024 } });

const roles = ['super_admin', 'property_manager'];

// ── Standard tenancy routes ───────────────────────────────────
router.get('/',            auth(roles), c.getAll);
router.post('/',           auth(roles), c.create);
router.put('/:id',         auth(roles), c.terminate);
router.post('/:id/lease',  auth(roles), upload.single('lease'), c.uploadLease);

// ── Tenant self-service — get own active tenancy ──────────────
router.get('/my', auth(['tenant']), async (req, res) => {
  const pool = require('../config/db');
  try {
    const [[tenancy]] = await pool.query(`
      SELECT ten.*,
        u.unit_number, u.id AS unit_id,
        pr.name AS property_name, pr.id AS property_id, pr.location AS property_address,
        mu.full_name AS manager_name, mu.phone AS manager_phone, mu.email AS manager_email
      FROM tenants t
      JOIN tenancies ten ON t.id = ten.tenant_id AND ten.status IN ('active','approved','pending')
      JOIN units u ON ten.unit_id = u.id
      JOIN properties pr ON u.property_id = pr.id
      LEFT JOIN users mu ON pr.manager_id = mu.id
      WHERE t.user_id = ?
      ORDER BY ten.created_at DESC LIMIT 1`, [req.user.sub]);
    if (!tenancy) return res.status(404).json({ error: 'No active tenancy found' });
    res.json({ tenancy });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Lease renewal routes (NEW) ────────────────────────────────
// GET  /api/tenancies/expiring?days=60  — list leases expiring within N days
router.get('/expiring',    auth(roles), renew.getExpiring);

// PUT  /api/tenancies/:id/renew         — renew a specific lease
router.put('/:id/renew',   auth(roles), renew.renew);

// ── Deposit refund routes (NEW) ───────────────────────────────
// GET  /api/tenancies/:id/deposit-summary  — get deposit held + refund record
router.get('/:id/deposit-summary', auth(roles), deposit.getDepositSummary);

// POST /api/tenancies/:id/deposit-refund   — create deposit refund with deductions
router.post('/:id/deposit-refund', auth(roles), deposit.createRefund);

// PUT  /api/deposit-refunds/:id            — mark refund as paid
router.put('/deposit-refunds/:id', auth(roles), deposit.markRefundPaid);


// ── Unit transfer ─────────────────────────────────────────────
const transfer = require('../controllers/admin/tenant_transfer');
router.get('/:id/transfer-options', auth(roles), transfer.getOptions);
router.post('/:id/transfer',        auth(roles), transfer.transfer);

// ── Billing mode toggle ───────────────────────────────────────
const invCtrl = require('../controllers/admin/invoice_control');
router.patch('/:id/billing-mode', auth(roles), invCtrl.setBillingMode);

module.exports = router;
