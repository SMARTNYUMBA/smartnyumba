const pool = require('../../config/db');
const { ok, err, safeErr } = require("../../utils/helpers");

exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return ok(res, { results: [] });
    const like = `%${q}%`;

    const results = [];
    // SECURITY FIX: none of the five queries below had an org_id filter
    // at all — this route is open to any authenticated user (auth() with
    // no role restriction, including tenants), so anyone could search up
    // tenant names/emails/phones, invoices, and payment transaction codes
    // across EVERY organisation on the platform, not just their own.
    const orgId = req.user.org_id;

    // Tenants
    const [tenants] = await pool.query(
      `SELECT 'tenant' AS type, u.id, u.full_name AS title,
        CONCAT(u.email,' · ',COALESCE(u.phone,'')) AS subtitle,
        '/admin/tenants' AS url
       FROM users u WHERE u.role='tenant' AND u.is_active=1 AND u.org_id=?
       AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?) LIMIT 5`,
      [orgId, like,like,like]);
    results.push(...tenants);

    // Units
    const [units] = await pool.query(
      `SELECT 'unit' AS type, u.id, CONCAT(u.unit_number,' - ',p.name) AS title,
        CONCAT(u.type,' · ',u.status) AS subtitle,
        '/admin/units' AS url
       FROM units u JOIN properties p ON u.property_id=p.id
       WHERE (u.unit_number LIKE ? OR p.name LIKE ?) AND p.org_id=? LIMIT 5`,
      [like,like, orgId]);
    results.push(...units);

    // Properties
    const [props] = await pool.query(
      `SELECT 'property' AS type, id, name AS title, location AS subtitle, '/admin/properties' AS url
       FROM properties WHERE (name LIKE ? OR location LIKE ?) AND org_id=? LIMIT 3`,
      [like,like, orgId]);
    results.push(...props);

    // Invoices
    const [invs] = await pool.query(
      `SELECT 'invoice' AS type, i.id,
        CONCAT('Invoice #',i.id,' - ',u.full_name) AS title,
        CONCAT(i.type,' · KES ',FORMAT(i.amount,0),' · ',i.status) AS subtitle,
        '/admin/invoices' AS url
       FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id
       JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
       WHERE (u.full_name LIKE ? OR i.type LIKE ?) AND ten.org_id=? LIMIT 3`,
      [like,like, orgId]);
    results.push(...invs);

    // Payments
    const [pmts] = await pool.query(
      `SELECT 'payment' AS type, py.id,
        CONCAT('Payment - ',u.full_name) AS title,
        CONCAT(COALESCE(py.transaction_code,''),' · KES ',FORMAT(py.amount,0)) AS subtitle,
        '/admin/payments' AS url
       FROM payments py JOIN tenancies ten ON py.tenancy_id=ten.id
       JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
       WHERE (py.transaction_code LIKE ? OR u.full_name LIKE ?) AND ten.org_id=? LIMIT 3`,
      [like,like, orgId]);
    results.push(...pmts);

    ok(res, { results, query: q });
  } catch(e) { safeErr(res, e); }
};
