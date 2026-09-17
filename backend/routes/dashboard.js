const router = require('express').Router();
const auth   = require('../middleware/auth');
const c      = require('../controllers/admin/dashboard');
// SECURITY FIX: 'owner' and 'tenant' were both in this route's role list.
// Owners have their own dedicated dashboard (controllers/owner/dashboard.js,
// scoped to owner_id) — this is the admin/manager financial dashboard
// (revenue, outstanding balances, top arrears with tenant names/phones),
// which a tenant should never see at all, and an owner should only see
// via their own scoped endpoint.
router.get('/', auth(['super_admin','property_manager','caretaker','security']), c.getDashboard);
module.exports = router;
