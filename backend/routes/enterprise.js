// backend/routes/enterprise.js  — NEW FILE
// Register in app.js:
//   app.use('/api/service-charges', require('./routes/enterprise').serviceCharges);
//   app.use('/api/security',        require('./routes/enterprise').security);
//   app.use('/api/import',          require('./routes/enterprise').imports);
//   And add to existing reports route: the rent-roll endpoint

const router        = require('express').Router();
const auth          = require('../middleware/auth');
const c             = require('../controllers/admin/enterprise');

// ── Service Charges ───────────────────────────────────────────
const serviceChargesRouter = require('express').Router();
const adminRoles = ['super_admin','property_manager'];

serviceChargesRouter.get('/rates',              auth(adminRoles), c.getRates);
serviceChargesRouter.post('/rates',             auth(adminRoles), c.upsertRate);
serviceChargesRouter.delete('/rates/:id',       auth(adminRoles), c.deleteRate);
serviceChargesRouter.post('/generate',          auth(adminRoles), c.generateServiceCharges);
serviceChargesRouter.post('/meter-reading',     auth([...adminRoles,'caretaker']), c.addMeterReading);

// ── Security tools ────────────────────────────────────────────
const securityRouter = require('express').Router();

securityRouter.get('/vehicle-lookup',
  auth([...adminRoles,'security','caretaker']),
  c.vehicleLookup
);

// ── Import ────────────────────────────────────────────────────
const importRouter = require('express').Router();

importRouter.post('/tenants',  auth(['super_admin']),  c.bulkImportTenants);

// CSV template download (no auth needed or basic auth)
importRouter.get('/template', auth(['super_admin']), (req, res) => {
  const csv = [
    'full_name,phone,email,id_number,unit_number,property_name,rent_amount,deposit,start_date',
    'John Kamau,0712345678,john@email.com,12345678,A1,Westlands Heights,15000,30000,2024-01-01',
    'Mary Wanjiku,0798765432,mary@email.com,87654321,B3,Kilimani Gardens,18000,36000,2024-02-01',
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="tenant_import_template.csv"');
  res.send(csv);
});

// FIX: app.js does `if (ent.serviceCharges) app.use(...)` / `ent.security` /
// `ent.imports`, but this file exported serviceChargesRouter/securityRouter/
// importRouter — every key mismatched, so none of the `if` checks ever
// passed and this entire route set (rates config, meter-reading via the
// enterprise path, vehicle lookup, bulk import) was never actually
// mounted; every request 404'd silently (app.js wraps the require in a
// try/catch, so there wasn't even a startup error to notice).
module.exports = { serviceCharges: serviceChargesRouter, security: securityRouter, imports: importRouter };