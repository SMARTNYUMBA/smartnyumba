const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    let sql = `SELECT vi.*, v.name AS vendor_name, p.name AS property_name, u.full_name AS approved_by_name
      FROM vendor_invoices vi
      JOIN vendors v ON vi.vendor_id = v.id
      JOIN properties p ON vi.property_id = p.id
      LEFT JOIN users u ON vi.approved_by = u.id
      WHERE vi.org_id=?`;
    const params = [req.user.org_id]; // SECURITY FIX: no org filter previously.
    if (req.user.role === 'property_manager') { sql += ' AND p.manager_id=?'; params.push(req.user.sub); }
    else if (req.user.property_id) { sql += ' AND vi.property_id=?'; params.push(req.user.property_id); }
    if (req.query.property_id) { sql += ' AND vi.property_id=?'; params.push(req.query.property_id); }
    if (req.query.status) { sql += ' AND vi.status=?'; params.push(req.query.status); }
    sql += ' ORDER BY vi.created_at DESC LIMIT 100';
    const [rows] = await pool.query(sql, params);
    ok(res, { invoices: rows });
  } catch(e) { err(res, e.message, 500); }
};

exports.create = async (req, res) => {
  try {
    const { vendor_id, property_id, amount, description, invoice_date, due_date, invoice_ref } = req.body;
    if (!vendor_id||!property_id||!amount) return err(res, 'vendor_id, property_id and amount required');
    // SECURITY FIX: vendor_id and property_id came from the request body
    // unvalidated — could create a vendor invoice pairing another
    // organisation's vendor with another organisation's property.
    const [[v]] = await pool.query('SELECT id FROM vendors WHERE id=? AND org_id=?', [vendor_id, req.user.org_id]);
    if (!v) return err(res, 'Vendor not found', 404);
    const [[p]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
    if (!p) return err(res, 'Property not found', 404);
    const [r] = await pool.query(
      'INSERT INTO vendor_invoices (vendor_id,property_id,amount,description,invoice_date,due_date,invoice_ref,created_by,org_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [vendor_id, property_id, amount, description||null, invoice_date||null, due_date||null, invoice_ref||null, req.user.sub, req.user.org_id]
    );
    ok(res, { id: r.insertId }, 201);
  } catch(e) { err(res, e.message, 500); }
};

exports.approve = async (req, res) => {
  try {
    // SECURITY FIX: previously ran unconditionally with no ownership
    // check — anyone could approve another organisation's vendor invoice.
    const [r] = await pool.query(
      "UPDATE vendor_invoices SET status='approved', approved_by=?, approved_at=NOW() WHERE id=? AND org_id=?",
      [req.user.sub, req.params.id, req.user.org_id]
    );
    if (r.affectedRows === 0) return err(res, 'Vendor invoice not found', 404);
    ok(res, { message: 'Invoice approved' });
  } catch(e) { err(res, e.message, 500); }
};

exports.markPaid = async (req, res) => {
  try {
    const { payment_ref } = req.body;
    // SECURITY FIX: previously ran unconditionally with no ownership
    // check — anyone could mark another organisation's vendor invoice paid.
    const [r] = await pool.query(
      "UPDATE vendor_invoices SET status='paid', payment_ref=?, paid_at=NOW() WHERE id=? AND org_id=?",
      [payment_ref||null, req.params.id, req.user.org_id]
    );
    if (r.affectedRows === 0) return err(res, 'Vendor invoice not found', 404);
    ok(res, { message: 'Invoice marked as paid' });
  } catch(e) { err(res, e.message, 500); }
};
