const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    let sql = 'SELECT e.*,p.name AS property_name,u.full_name AS created_by_name FROM expenses e JOIN properties p ON e.property_id=p.id JOIN users u ON e.created_by=u.id WHERE e.org_id=?';
    const params = [req.user.org_id]; // SECURITY FIX: no org filter previously.
    if (req.query.property_id) { sql += ' AND e.property_id=?'; params.push(req.query.property_id); }
    // Scope to assigned property
    if (req.user.role === 'property_manager') {
      sql += ' AND p.manager_id=?'; params.push(req.user.sub);
    } else if (['caretaker','security'].includes(req.user.role) && req.user.property_id) {
      sql += ' AND e.property_id=?'; params.push(req.user.property_id);
    }
    if (req.query.month) { sql += " AND DATE_FORMAT(e.expense_date,'%Y-%m')=?"; params.push(req.query.month); }
    sql += ' ORDER BY e.expense_date DESC';
    const [rows] = await pool.query(sql, params);
    const total = rows.reduce((s,e) => s + parseFloat(e.amount), 0);
    ok(res, { expenses: rows, total });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { property_id,title,description,amount,category,vendor,receipt_ref,expense_date } = req.body;
    if (!property_id||!title||!amount||!expense_date) return err(res, 'property_id, title, amount and expense_date required');
    // SECURITY FIX: property_id came from the request body unvalidated —
    // could record an expense against another organisation's property.
    const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
    if (!prop) return err(res, 'Property not found', 404);
    const [r] = await pool.query('INSERT INTO expenses (property_id,title,description,amount,category,vendor,receipt_ref,expense_date,created_by,org_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [property_id, title, description||null, amount, category||'other', vendor||null, receipt_ref||null, expense_date, req.user.sub, req.user.org_id]);
    ok(res, { id: r.insertId, message: 'Expense recorded' }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.delete = async (req, res) => {
  try {
    // SECURITY FIX: no org check — any property_manager/caretaker could
    // delete another organisation's expense record by guessing its ID.
    // getAll()/create() were already scoped to org_id, but delete/update
    // were missed.
    const [r] = await pool.query('DELETE FROM expenses WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'Expense not found', 404);
    ok(res, { message: 'Expense deleted' });
  } catch(e) { safeErr(res, e); }
};

exports.update = async (req, res) => {
  try {
    const { title, amount, expense_date, category, vendor, notes, receipt_url } = req.body;
    // SECURITY FIX: same missing org check as delete() — could read and
    // overwrite another organisation's expense record by ID.
    const [[ex]] = await pool.query('SELECT * FROM expenses WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    if (!ex) return err(res, 'Expense not found', 404);
    await pool.query(
      'UPDATE expenses SET title=?,amount=?,expense_date=?,category=?,vendor=?,notes=?,receipt_url=? WHERE id=? AND org_id=?',
      [title||ex.title, amount||ex.amount, expense_date||ex.expense_date,
       category||ex.category, vendor??ex.vendor, notes??ex.notes,
       receipt_url??ex.receipt_url, req.params.id, req.user.org_id]);
    ok(res, { message: 'Expense updated' });
  } catch(e) { safeErr(res, e); }
};
