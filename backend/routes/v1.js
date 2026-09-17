'use strict';

/**
 * SmartNyumba Pro — API v1 Router
 *
 * All routes are mounted under BOTH:
 *   /api/...    (legacy — backward compatible, existing clients unaffected)
 *   /api/v1/... (versioned — new integrations should use this)
 *
 * When breaking changes are needed, introduce /api/v2/ here without
 * removing /api/v1/, giving existing clients a migration window.
 *
 * Mount this in app.js:
 *   app.use('/api/v1', require('./routes/v1'));
 */

const router = require('express').Router();

// ── All existing route modules ────────────────────────────────
router.use('/auth',            require('./auth'));
router.use('/dashboard',       require('./dashboard'));
router.use('/properties',      require('./properties'));
router.use('/units',           require('./units'));
router.use('/tenants',         require('./tenants'));
router.use('/tenancies',       require('./tenancies'));
router.use('/invoices',        require('./invoices'));
router.use('/payments',        require('./payments'));
router.use('/maintenance',     require('./maintenance'));
router.use('/visitors',        require('./visitors'));
router.use('/parking',         require('./parking'));
router.use('/expenses',        require('./expenses'));
router.use('/reports',         require('./reports'));
router.use('/announcements',   require('./announcements'));
router.use('/vacate',          require('./vacate'));
router.use('/utilities',       require('./utilities'));
router.use('/users',           require('./users'));
router.use('/settings',        require('./settings'));
router.use('/mpesa',           require('./mpesa'));
router.use('/pdf',             require('./pdf'));
router.use('/vendors',         require('./vendors'));
router.use('/access-log',      require('./accessLog'));
router.use('/search',          require('./search'));
router.use('/inspections',     require('./inspections'));
router.use('/sharedMeters',    require('./sharedMeters'));
router.use('/messages',        require('./messages'));
router.use('/notifications',   require('./notifications'));
router.use('/cases',           require('./cases'));
router.use('/documents',       require('./documents'));
router.use('/ratings',         require('./ratings'));
router.use('/owner',           require('./owner'));
router.use('/logbook',         require('./logbook'));
router.use('/service-charges', require('./serviceCharges'));

// ── v1-specific meta endpoint ─────────────────────────────────
router.get('/', (req, res) => {
  res.json({
    version:     'v1',
    status:      'active',
    deprecated:  false,
    description: 'SmartNyumba Pro API v1',
    docs:        '/api/v1/docs',
    timestamp:   new Date().toISOString(),
  });
});

module.exports = router;
