const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    let sql = `SELECT ps.*,pr.name AS property_name,
      u.full_name AS assigned_user_name,un.unit_number AS assigned_unit
      FROM parking_slots ps JOIN properties pr ON ps.property_id=pr.id
      LEFT JOIN users u ON ps.assigned_to_user_id=u.id
      LEFT JOIN units un ON ps.assigned_to_unit_id=un.id
      WHERE ps.org_id=?`;
    const params = [req.user.org_id]; // SECURITY FIX: previously a super_admin
    // (no property_id, not property_manager) had no WHERE clause at all —
    // saw every parking slot across every organisation.
    // Scope: manager→assigned properties only; caretaker/security→their property only
    if (req.user.role === 'property_manager') {
      sql += ' AND pr.manager_id=?';
      params.push(req.user.sub);
    } else if (req.user.property_id) {
      sql += ' AND ps.property_id=?';
      params.push(req.user.property_id);
    }
    sql += ' ORDER BY pr.name,ps.slot_number';
    const [slots] = await pool.query(sql, params);
    ok(res, { slots });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { property_id, slot_number, type } = req.body;
    if (!property_id || !slot_number) return err(res, 'property_id and slot_number required');

    // SECURITY FIX: this org check was missing entirely — a super_admin
    // (i.e. any role not property_manager/caretaker/security) could
    // create a parking slot under another organisation's property.
    const [[propOrg]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [property_id, req.user.org_id]);
    if (!propOrg) return err(res, 'Property not found', 404);

    // Enforce: manager can only create slots in their own properties
    if (req.user.role === 'property_manager') {
      const [[prop]] = await pool.query('SELECT id FROM properties WHERE id=? AND manager_id=?', [property_id, req.user.sub]);
      if (!prop) return err(res, 'You can only add parking slots to your assigned properties', 403);
    }
    // Caretaker/security can only add slots to their property
    if (['caretaker','security'].includes(req.user.role) && req.user.property_id) {
      if (parseInt(property_id) !== req.user.property_id) return err(res, 'You can only manage parking in your assigned property', 403);
    }

    const [r] = await pool.query('INSERT INTO parking_slots (property_id,slot_number,type,org_id) VALUES (?,?,?,?)',
      [property_id, slot_number, type||'resident', req.user.org_id]);
    ok(res, { id: r.insertId }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.assign = async (req, res) => {
  try {
    const { assignee_type, user_id, unit_id, vehicle_plate, visitor_name } = req.body;
    const slotId = req.params.id;
    if (!assignee_type) return err(res, 'assignee_type required');

    const plate = vehicle_plate ? vehicle_plate.toUpperCase().trim() : null;

    // SECURITY FIX: previously no org check — anyone could view or
    // reassign another organisation's parking slot by ID.
    const [[slot]] = await pool.query('SELECT * FROM parking_slots WHERE id=? AND org_id=?', [slotId, req.user.org_id]);
    if (!slot) return err(res, 'Slot not found', 404);
    if (slot.assigned_to_type !== 'unassigned' && assignee_type !== 'unassigned')
      return err(res, `Slot is already assigned to a ${slot.assigned_to_type}. Release it first.`, 409);

    if (assignee_type === 'unassigned') {
      await pool.query(
        "UPDATE parking_slots SET assigned_to_type='unassigned',assigned_to_user_id=NULL,assigned_to_unit_id=NULL,assigned_vehicle_plate=NULL,assigned_visitor_name=NULL,status='vacant' WHERE id=? AND org_id=?",
        [slotId, req.user.org_id]);
      return ok(res, { message: 'Slot released' });
    }

    // BUG FIX: "who is occupying" was showing just the generic assignee
    // type ("tenant") for the most common assignment case, because the
    // frontend's tenant-assignment form only ever sent `unit_id`, never
    // `user_id` — so assigned_to_user_id stayed NULL and the join to
    // users (for assigned_user_name) never matched. Deriving the actual
    // occupant from the unit's current active tenancy here, server-side,
    // is also more correct than trusting a client-supplied user_id: it's
    // always whoever actually lives there right now, not whoever the
    // client happened to have selected.
    let resolvedUserId = user_id || null;
    if (assignee_type === 'tenant' && unit_id) {
      const [[occupant]] = await pool.query(
        `SELECT u.id FROM tenancies ten
         JOIN tenants t ON ten.tenant_id = t.id
         JOIN users u ON t.user_id = u.id
         WHERE ten.unit_id=? AND ten.status='active' LIMIT 1`,
        [unit_id]);
      resolvedUserId = occupant?.id || null;
    }

    // BUG FIX: visitor_name was accepted here and then silently
    // discarded — parking_slots had no column to store it at all, so a
    // visitor-assigned slot showed no identifying information beyond
    // the word "visitor". migrations/013_parking_assignee_fix.js adds
    // assigned_visitor_name for this.
    const visitorNameToStore = assignee_type === 'visitor' ? (visitor_name?.trim() || null) : null;

    await pool.query(
      "UPDATE parking_slots SET assigned_to_type=?,assigned_to_user_id=?,assigned_to_unit_id=?,assigned_vehicle_plate=?,assigned_visitor_name=?,status='occupied' WHERE id=? AND org_id=?",
      [assignee_type, resolvedUserId, unit_id||null, plate, visitorNameToStore, slotId, req.user.org_id]);
    ok(res, { message: `Slot assigned to ${assignee_type}` });
  } catch(e) { safeErr(res, e); }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const [r] = await pool.query('UPDATE parking_slots SET status=? WHERE id=? AND org_id=?', [status, req.params.id, req.user.org_id]);
    if (r.affectedRows === 0) return err(res, 'Slot not found', 404);
    ok(res, { message: 'Slot updated' });
  } catch(e) { safeErr(res, e); }
};
