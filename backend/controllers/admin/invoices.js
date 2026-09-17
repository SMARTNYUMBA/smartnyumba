const pool = require('../../config/db');
const { ok, err, safeErr, monthYear } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    // FIX: replaced correlated subquery for receipt_number with a derived-table JOIN.
    // Old approach ran one extra SELECT per invoice row — O(n) subqueries, slow at scale.
    // New approach: pre-aggregate the latest payment per invoice in one pass, then JOIN.
    let sql = `SELECT i.*,u.full_name AS tenant_name,u.phone AS tenant_phone,
      un.unit_number,pr.name AS property_name,rc.receipt_number
      FROM invoices i JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
      JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
      LEFT JOIN (
        SELECT p.invoice_id, r.receipt_number
        FROM payments p
        JOIN receipts r ON r.payment_id = p.id
        INNER JOIN (
          SELECT invoice_id, MAX(paid_at) AS latest_paid_at
          FROM payments GROUP BY invoice_id
        ) lp ON p.invoice_id = lp.invoice_id AND p.paid_at = lp.latest_paid_at
      ) rc ON rc.invoice_id = i.id
      WHERE i.org_id=?`; // SECURITY FIX: no org filter at all previously —
      // any authenticated user could list every invoice in the system,
      // not just their organisation's.
    const params = [req.user.org_id];

    // TENANT: can only see their own invoices
    if (req.user.role === 'tenant') {
      const [[t]] = await pool.query('SELECT id FROM tenants WHERE user_id=?', [req.user.sub]);
      if (!t) return ok(res, { invoices: [] });
      sql += ' AND ten.tenant_id=?'; params.push(t.id);
    }

    if (req.query.status)      { sql += ' AND i.status=?';      params.push(req.query.status); }
    if (req.query.type)        { sql += ' AND i.type=?';        params.push(req.query.type); }
    if (req.query.tenancy_id)  { sql += ' AND i.tenancy_id=?';  params.push(req.query.tenancy_id); }
    if (req.query.tenant_id)   { sql += ' AND ten.tenant_id=?'; params.push(req.query.tenant_id); }
    if (req.query.property_id) { sql += ' AND pr.id=?';         params.push(req.query.property_id); }

    // ── Property scope: manager sees only assigned properties, caretaker/security only theirs
    if (req.user.role === 'property_manager') {
      sql += ' AND pr.manager_id=?'; params.push(req.user.sub);
    } else if (['caretaker','security'].includes(req.user.role) && req.user.property_id) {
      sql += ' AND pr.id=?'; params.push(req.user.property_id);
    }

    // BUG FIX: this endpoint completely ignored the page/limit params the
    // frontend sends and returned pagination:undefined — pages/admin/
    // Invoices.jsx's "Next" button (meta.pages > 1) never appeared no
    // matter how many invoices existed, and everything past the hardcoded
    // 200-row cap was permanently unreachable. Added real pagination,
    // mirroring the working pattern already in tenancies.js's getAll:
    // capture the WHERE-clause tail built above and reuse it against a
    // COUNT(*) query, rather than re-deriving the filter logic twice.
    const whereTail = sql.slice(sql.indexOf(' WHERE i.org_id=?'));
    const countSql = `SELECT COUNT(*) AS total FROM invoices i
      JOIN tenancies ten ON i.tenancy_id=ten.id
      JOIN tenants t ON ten.tenant_id=t.id JOIN users u ON t.user_id=u.id
      JOIN units un ON ten.unit_id=un.id JOIN properties pr ON un.property_id=pr.id
      ${whereTail}`;
    const [[{ total }]] = await pool.query(countSql, params).catch(() => [[{ total: 0 }]]);

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    sql += ` ORDER BY i.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await pool.query(sql, params);
    ok(res, { invoices: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { tenancy_id, type, amount, due_date, notes } = req.body;
    if (!tenancy_id || !type || !amount || !due_date) return err(res, 'tenancy_id, type, amount and due_date required');
    // SECURITY FIX: previously no org check — a user could invoice a
    // tenancy belonging to a different organisation just by supplying its ID.
    const [[ten]] = await pool.query('SELECT * FROM tenancies WHERE id=? AND org_id=?', [tenancy_id, req.user.org_id]);
    if (!ten) return err(res, 'Tenancy not found', 404);
    const [r] = await pool.query(
      'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,notes,org_id) VALUES (?,?,?,?,?,?,?)',
      [tenancy_id, type, amount, amount, due_date, notes||null, req.user.org_id]);
    // Add to ledger
    await pool.query('INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
      [tenancy_id,'debit',amount,type.replace('_',' ').toUpperCase()+' invoice','invoice',r.insertId]);
    // Notify tenant
    const [[t]] = await pool.query('SELECT u.id AS user_id FROM tenants t JOIN users u ON t.user_id=u.id WHERE t.id=?',[ten.tenant_id]);
    if (t) {
      const { notify } = require('./notifications');
      await notify(pool, { user_id:t.user_id, type:'invoice', title:'New invoice created', message:`New ${type.replace('_',' ')} invoice of KES ${Number(amount).toLocaleString()} due ${due_date}`, action_url:'/tenant/invoices' });
    }
    // FEATURE: fire invoice.created for org webhook subscribers.
    require('../../services/webhooks').deliverEvent('invoice.created', {
      invoice_id: r.insertId, tenancy_id, type, amount: Number(amount), due_date,
    }, req.user.org_id);
    ok(res, { id: r.insertId, message: 'Invoice created' }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.update = async (req, res) => {
  try {
    const { status, amount, due_date, notes } = req.body;
    // SECURITY FIX: previously ran UPDATE unconditionally on any id, with
    // no existence check and no org check — a user could silently edit
    // (or no-op on) any invoice in the entire system.
    const [r] = await pool.query('UPDATE invoices SET status=?,due_date=?,notes=? WHERE id=? AND org_id=?',
      [status, due_date, notes||null, req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'Invoice not found', 404);
    ok(res, { message: 'Invoice updated' });
  } catch(e) { safeErr(res, e); }
};

exports.markOverdue = async (req, res) => {
  try {
    const [r] = await pool.query("UPDATE invoices SET status='overdue' WHERE id=? AND status='unpaid' AND org_id=?",
      [req.params.id, req.user.org_id]);
    ok(res, { message: 'Marked overdue' });
  } catch(e) { safeErr(res, e); }
};

exports.bulkGenerate = async (req, res) => {
  // FIX: entire bulk operation now runs inside a single transaction.
  // Previously, a crash mid-loop left some tenancies with invoices and others without,
  // with no clean way to detect or recover. Now it's fully atomic: all-or-nothing.
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const { property_id, due_date } = req.body;
    const dd = due_date || new Date(Date.now()+7*86400000).toISOString().split('T')[0];
    const my = new Date().toISOString().slice(0,7);

    // Guard: block runaway bulk operations
    // BUG FIX: this counted active tenancies across the WHOLE PLATFORM,
    // not this org's — once the platform total crossed 2000, every
    // organisation (even one with 10 tenancies) got blocked from bulk-
    // generating invoices. Scoped to the caller's org, matching the
    // rest of this function.
    const [[{ active_count }]] = await conn.query(
      "SELECT COUNT(*) AS active_count FROM tenancies WHERE status='active' AND org_id=?", [req.user.org_id]
    );
    if (active_count > 2000) {
      await conn.rollback(); conn.release();
      return err(res, 'Too many active tenancies for bulk generate. Use cron-based auto-invoicing instead.', 400);
    }

    let sql = "SELECT * FROM tenancies WHERE status='active' AND org_id=?";
    const params = [req.user.org_id]; // SECURITY FIX: previously scanned ALL orgs' active
    // tenancies — bulk-generating invoices across every organisation on the platform.
    if (property_id) { sql += ' AND unit_id IN (SELECT id FROM units WHERE property_id=? AND org_id=?)'; params.push(property_id, req.user.org_id); }
    const [tenancies] = await conn.query(sql, params);

    let generated = 0, skipped = 0;
    const created = [];
    for (const ten of tenancies) {
      const [[ex]] = await conn.query(
        "SELECT id FROM invoices WHERE tenancy_id=? AND type='rent' AND DATE_FORMAT(due_date,'%Y-%m')=?",
        [ten.id, my]
      );
      if (ex) { skipped++; continue; }
      const [r] = await conn.query(
        'INSERT INTO invoices (tenancy_id,type,amount,balance,due_date,org_id) VALUES (?,?,?,?,?,?)',
        [ten.id, 'rent', ten.rent_amount, ten.rent_amount, dd, req.user.org_id]
      );
      await conn.query(
        'INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
        [ten.id, 'debit', ten.rent_amount, 'RENT invoice', 'invoice', r.insertId]
      );
      created.push({ invoice_id: r.insertId, tenancy_id: ten.id, amount: Number(ten.rent_amount) });
      generated++;
    }

    await conn.commit();
    conn.release();
    // FEATURE: fire invoice.created for org webhook subscribers, one per
    // invoice generated in this batch.
    const webhooks = require('../../services/webhooks');
    for (const c of created) {
      webhooks.deliverEvent('invoice.created', { ...c, type: 'rent', due_date: dd }, req.user.org_id);
    }
    ok(res, { generated, skipped, message: `Generated ${generated} invoices, skipped ${skipped}` });
  } catch(e) {
    await conn.rollback().catch(()=>{});
    conn.release();
    safeErr(res, e);
  }
};

exports.waiveFee = async (req, res) => {
  try {
    const invoiceId = req.params.id;

    // SECURITY FIX: previously no org check — anyone could waive the fee
    // on (i.e. zero out) any invoice in the entire system by ID.
    const [[inv]] = await pool.query(
      "SELECT * FROM invoices WHERE id=? AND org_id=?",
      [invoiceId, req.user.org_id]
    );

    if (!inv) return err(res, "Invoice not found", 404);

    // ✅ Better approach: don't destroy original amount
    await pool.query(
      "UPDATE invoices SET balance = 0, status='paid', notes = CONCAT(IFNULL(notes,''), ' | Fee waived') WHERE id=? AND org_id=?",
      [invoiceId, req.user.org_id]
    );

    // ✅ Add ledger entry (important for accounting)
    await pool.query(
      "INSERT INTO tenant_ledger (tenancy_id,type,amount,description,ref_type,ref_id) VALUES (?,?,?,?,?,?)",
      [
        inv.tenancy_id,
        'credit',
        inv.balance,
        'FEE WAIVED',
        'invoice',
        invoiceId
      ]
    );

    ok(res, { message: "Fee waived successfully" });
  } catch (e) {
    err(res, e.message, 500);
  }
};