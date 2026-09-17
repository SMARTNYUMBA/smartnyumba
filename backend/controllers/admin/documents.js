const pool   = require('../../config/db');
const path   = require('path');
const fs     = require('fs');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    let sql = `SELECT d.*,p.name AS property_name,u.full_name AS uploaded_by_name
      FROM documents d LEFT JOIN properties p ON d.property_id=p.id
      JOIN users u ON d.uploaded_by=u.id WHERE d.org_id=?`;
    const params = [req.user.org_id]; // SECURITY FIX: no org filter previously —
    // documents (leases, ID scans) were listable across every organisation.
    if (req.query.property_id) { sql += ' AND d.property_id=?'; params.push(req.query.property_id); }
    if (req.query.category)    { sql += ' AND d.category=?';    params.push(req.query.category); }
    if (req.query.tenancy_id)  { sql += ' AND d.tenancy_id=?';  params.push(req.query.tenancy_id); }
    if (req.user.role === 'tenant') {
      const [[t]] = await pool.query('SELECT ten.id FROM tenants t JOIN tenancies ten ON t.id=ten.tenant_id WHERE t.user_id=? AND ten.status="active" LIMIT 1', [req.user.sub]);
      if (t) { sql += ' AND d.tenancy_id=?'; params.push(t.id); }
      else return ok(res, { documents: [] });
    }
    sql += ' ORDER BY d.created_at DESC';
    const [rows] = await pool.query(sql, params);
    ok(res, { documents: rows });
  } catch(e) { err(res, e.message, 500); }
};

exports.upload = async (req, res) => {
  try {
    if (!req.file) return err(res, 'No file uploaded');
    const { property_id, tenancy_id, tenant_id, category, title, notes } = req.body;
    // SECURITY FIX: this route is open to any authenticated user
    // (including tenants), and property_id/tenancy_id/tenant_id came
    // straight from the request body unvalidated — a tenant could
    // attach their upload to another organisation's (or another
    // tenant's) property/tenancy record.
    if (property_id) {
      const [[p]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
      if (!p) return err(res, 'Property not found', 404);
    }
    if (tenancy_id) {
      const [[t]] = await pool.query('SELECT id FROM tenancies WHERE id=? AND org_id=?', [tenancy_id, req.user.org_id]);
      if (!t) return err(res, 'Tenancy not found', 404);
      if (req.user.role === 'tenant') {
        const [[owns]] = await pool.query(
          'SELECT ten.id FROM tenancies ten JOIN tenants t ON ten.tenant_id=t.id WHERE ten.id=? AND t.user_id=?',
          [tenancy_id, req.user.sub]);
        if (!owns) return err(res, 'Tenancy not found', 404);
      }
    }
    const fileUrl = `/uploads/documents/${req.file.filename}`;
    const [r] = await pool.query(
      'INSERT INTO documents (property_id,tenancy_id,tenant_id,uploaded_by,category,title,filename,file_url,file_size,notes,org_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [property_id||null, tenancy_id||null, tenant_id||null, req.user.sub,
       category||'other', title||req.file.originalname, req.file.originalname,
       fileUrl, req.file.size, notes||null, req.user.org_id]);
    ok(res, { id: r.insertId, file_url: fileUrl, message: 'Document uploaded' }, 201);
  } catch(e) { err(res, e.message, 500); }
};

exports.delete = async (req, res) => {
  try {
    // SECURITY FIX: previously WHERE id=? with no org check — anyone
    // could delete (including the underlying file on disk) another
    // organisation's document — leases, ID scans, etc.
    const [[doc]] = await pool.query('SELECT * FROM documents WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    if (!doc) return err(res, 'Document not found', 404);
    // Delete file from disk
    const filePath = path.join(__dirname, '../../', doc.file_url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM documents WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    ok(res, { message: 'Document deleted' });
  } catch(e) { err(res, e.message, 500); }
};
