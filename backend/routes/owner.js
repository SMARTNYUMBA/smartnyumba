const router = require('express').Router();
const auth   = require('../middleware/auth');
const dash   = require('../controllers/owner/dashboard');
const c      = require('../controllers/owner/properties');

// ── Owner-facing endpoints ────────────────────────────────────
router.get('/dashboard',              auth(['owner']),                              dash.getDashboard);
router.get('/remittances',            auth(['owner']),                              dash.getRemittances);
router.get('/properties',             auth(['owner']),                              c.getProperties);
router.get('/units',                  auth(['owner']),                              c.getUnits);
router.get('/maintenance',            auth(['owner']),                              c.getMaintenance);
router.get('/invoices',               auth(['owner']),                              c.getInvoices);
router.get('/expenses',               auth(['owner']),                              c.getExpenses);
router.get('/tenants',                auth(['owner']),                              c.getTenants);
router.get('/staff',                  auth(['owner']),                              c.getStaff);

// ── Manager/admin endpoints ───────────────────────────────────
router.post('/remittances',           auth(['super_admin','property_manager']),     c.recordRemittance);
router.get('/remittances-by-manager', auth(['super_admin','property_manager']),     c.getRemittancesByManager);

module.exports = router;
