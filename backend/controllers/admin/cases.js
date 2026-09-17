const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');
const { notify } = require('./notifications');

exports.getAll = async (req, res) => {
  try {
    let sql = `SELECT c.*,p.name AS property_name,
      u.full_name AS raised_by_name,a.full_name AS assigned_name
      FROM cases c JOIN properties p ON c.property_id=p.id
      JOIN users u ON c.raised_by=u.id
      LEFT JOIN users a ON c.assigned_to=a.id WHERE c.org_id=?`;
    const params = [req.user.org_id]; // SECURITY FIX: no org filter previously —
    // a super_admin without a property_id query param saw every case
    // across every organisation on the platform.

    if (req.query.status)      { sql += ' AND c.status=?';      params.push(req.query.status); }
    if (req.query.priority)    { sql += ' AND c.priority=?';    params.push(req.query.priority); }

    // Tenant: own cases only
    if (req.user.role === 'tenant') {
      sql += ' AND c.raised_by=?'; params.push(req.user.sub);
    }
    // Manager: scope to their assigned property (from JWT or query)
    else if (req.user.role === 'property_manager' && req.user.property_id) {
      sql += ' AND c.property_id=?'; params.push(req.user.property_id);
    }
    // Admin: optional property filter from query
    else if (req.query.property_id) {
      sql += ' AND c.property_id=?'; params.push(req.query.property_id);
    }

    sql += ' ORDER BY FIELD(c.priority,"emergency","urgent","normal","low"),c.created_at DESC';
    const [rows] = await pool.query(sql, params);
    ok(res, { cases: rows });
  } catch(e) { err(res, e.message, 500); }
};

exports.create = async (req, res) => {
  try {
    const { property_id, tenancy_id, title, description, category, priority } = req.body;
    if (!title) return err(res, 'Title required');
    let pid = property_id;
    if (!pid && req.user.role === 'tenant') {
      const [[t]] = await pool.query(
        `SELECT un.property_id FROM tenants t
         JOIN tenancies ten ON t.id=ten.tenant_id AND ten.status IN ('active','approved','pending')
         JOIN units un ON ten.unit_id=un.id
         WHERE t.user_id=? LIMIT 1`, [req.user.sub]);
      if (t) pid = t.property_id;
    }
    if (!pid) return err(res, 'property_id required');
    // SECURITY FIX: an explicitly-supplied property_id was never checked
    // against the caller's org.
    const [[propCheck]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [pid, req.user.org_id]);
    if (!propCheck) return err(res, 'Property not found', 404);

    const [r] = await pool.query(
      'INSERT INTO cases (property_id,tenancy_id,raised_by,title,description,category,priority,org_id) VALUES (?,?,?,?,?,?,?,?)',
      [pid, tenancy_id||null, req.user.sub, title, description||null, category||'other', priority||'normal', req.user.org_id]);

    // Notify managers — use correct action_url per role
    // SECURITY FIX: previously notified every super_admin/property_manager
    // across every organisation on the platform about this one org's case.
    const [mgrs] = await pool.query(
      "SELECT id,role FROM users WHERE role IN('super_admin','property_manager') AND is_active=1 AND org_id=?", [req.user.org_id]);
    for (const m of mgrs) {
      const action_url = m.role === 'super_admin' ? '/admin/cases' : '/manager/cases';
      await notify(pool, { user_id:m.id, type:'case', title:`New case: ${title}`, message:description?.slice(0,80)||title, action_url });
    }
    ok(res, { id: r.insertId, message: 'Case created' }, 201);
  } catch(e) { err(res, e.message, 500); }
};

exports.update = async (req, res) => {
  try {
    const { status, assigned_to, priority } = req.body;
    // BUG FIX: the only frontend caller (admin/Cases.jsx) changes status
    // and priority via two separate dropdowns, each sending only
    // {status, priority} — it never includes assigned_to (there's no
    // "assign" control in that UI at all yet). assigned_to||null meant
    // every status or priority change silently unassigned the case.
    // COALESCE so omitting it preserves whatever's already there.
    const resolved = status === 'resolved' ? ',resolved_at=NOW()' : '';
    // SECURITY FIX: previously no org check — anyone could update another
    // organisation's case (status, assignee, priority).
    const [r] = await pool.query(`UPDATE cases SET status=?,assigned_to=COALESCE(?,assigned_to),priority=?${resolved} WHERE id=? AND org_id=?`,
      [status, assigned_to||null, priority, req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'Case not found', 404);
    ok(res, { message: 'Case updated' });
  } catch(e) { err(res, e.message, 500); }
};

exports.addComment = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment) return err(res, 'Comment required');
    // SECURITY FIX: no org check — could comment on another
    // organisation's case by ID. case_comments has no org_id column of
    // its own, so ownership is verified via the parent case.
    const [[c]] = await pool.query('SELECT raised_by FROM cases WHERE id=? AND org_id=?', [req.params.id, req.user.org_id]);
    if (!c) return err(res, 'Case not found', 404);
    await pool.query('INSERT INTO case_comments (case_id,user_id,comment) VALUES (?,?,?)',
      [req.params.id, req.user.sub, comment]);
    if (c.raised_by !== req.user.sub) {
      await notify(pool, { user_id:c.raised_by, type:'case', title:'New comment on your case', message:comment.slice(0,80), action_url:'/tenant/cases' });
    }
    ok(res, { message: 'Comment added' });
  } catch(e) { err(res, e.message, 500); }
};

exports.getComments = async (req, res) => {
  try {
    // SECURITY FIX: no org check — could read comment threads on
    // another organisation's case by ID.
    const [rows] = await pool.query(
      `SELECT cc.*,u.full_name,u.role,u.profile_photo
       FROM case_comments cc
       JOIN users u ON cc.user_id=u.id
       JOIN cases c ON cc.case_id=c.id
       WHERE cc.case_id=? AND c.org_id=? ORDER BY cc.created_at`,
      [req.params.id, req.user.org_id]);
    ok(res, { comments: rows });
  } catch(e) { err(res, e.message, 500); }
};
