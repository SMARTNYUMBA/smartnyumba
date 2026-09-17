const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getInbox = async (req, res) => {
  try {
    // Messages addressed directly to this user
    // OR broadcast messages (to_user_id IS NULL) for the user's property:
    //   - manager/owner: via properties.manager_id / owner_id
    //   - caretaker/security/any staff: via users.property_id
    //
    // BUG FIX: messages.is_read is a single column, which can't represent
    // "read by whom" for a broadcast (many recipients, one row). It was
    // always 0 for a broadcast, so broadcasts could never be marked read.
    // Per-recipient state now comes from message_reads for broadcasts;
    // direct messages keep using messages.is_read, unchanged.
    const [rows] = await pool.query(`
      SELECT m.*,
        u.full_name AS from_name, u.role AS from_role,
        u.profile_photo AS from_photo,
        p.name AS property_name,
        (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id) AS reply_count,
        CASE WHEN m.to_user_id IS NULL
             THEN EXISTS(SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
             ELSE m.is_read = 1
        END AS is_read
      FROM messages m
      JOIN users u ON m.from_user_id = u.id
      JOIN properties p ON m.property_id = p.id
      WHERE m.parent_id IS NULL
        AND p.org_id = ?
        AND (
          m.to_user_id = ?
          OR m.from_user_id = ?
          OR (
            m.to_user_id IS NULL
            AND (
              m.property_id IN (
                SELECT id FROM properties WHERE manager_id = ? OR owner_id = ?
                UNION
                SELECT property_id FROM users WHERE id = ? AND property_id IS NOT NULL
              )
              OR EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'super_admin')
            )
          )
        )
      ORDER BY m.created_at DESC LIMIT 100`,
      [req.user.sub, req.user.org_id, req.user.sub, req.user.sub, req.user.sub, req.user.sub, req.user.sub, req.user.sub]);
    const unread = rows.filter(r => !r.is_read).length;
    ok(res, { messages: rows, unread });
  } catch(e) { safeErr(res, e); }
};

exports.getSent = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, u.full_name AS to_name, p.name AS property_name
      FROM messages m
      LEFT JOIN users u ON m.to_user_id = u.id
      JOIN properties p ON m.property_id = p.id
      WHERE m.from_user_id = ?
      ORDER BY m.created_at DESC LIMIT 100`,
      [req.user.sub]);
    ok(res, { messages: rows });
  } catch(e) { safeErr(res, e); }
};

exports.send = async (req, res) => {
  try {
    const { property_id, to_user_id, subject, body } = req.body;
    if (!body) return err(res, 'Message body required');

    let pid = property_id || null;
    // SECURITY FIX: an explicitly-supplied property_id was never
    // checked against the caller's org.
    if (pid) {
      const [[propCheck]] = await pool.query('SELECT id FROM properties WHERE id=? AND org_id=?', [pid, req.user.org_id]);
      if (!propCheck) return err(res, 'Property not found', 404);
    }

    // Auto-detect property for tenants and property-assigned staff
    if (!pid) {
      if (req.user.role === 'tenant') {
        const [[t]] = await pool.query(
          `SELECT un.property_id FROM tenants t
           JOIN tenancies ten ON t.id = ten.tenant_id AND ten.status IN ('active','approved','pending')
           JOIN units un ON ten.unit_id = un.id
           WHERE t.user_id = ? ORDER BY ten.created_at DESC LIMIT 1`,
          [req.user.sub]);
        if (t) pid = t.property_id;
      } else if (req.user.property_id) {
        pid = req.user.property_id;
      }
    }
    // SECURITY/BUG FIX: property_manager and owner relate to properties via
    // properties.manager_id/owner_id (one manager or owner can have many
    // properties) — NOT via users.property_id, which is a single-property
    // assignment field really meant for caretaker/security. So the
    // `else if (req.user.property_id)` branch above never applies to a
    // manager or owner, and with no to_user_id (a broadcast) they fell
    // all the way through to "ANY property in the org" below — literally
    // the first property row found, with no guarantee it's one they
    // actually manage/own. A manager broadcasting "to everyone" could
    // silently message a completely different property's staff/owner
    // while believing they'd reached their own team.
    if (!pid && req.user.role === 'property_manager') {
      const [[mp]] = await pool.query('SELECT id FROM properties WHERE manager_id=? AND org_id=? LIMIT 1', [req.user.sub, req.user.org_id]);
      pid = mp?.id || null;
    }
    if (!pid && req.user.role === 'owner') {
      const [[op]] = await pool.query('SELECT id FROM properties WHERE owner_id=? AND org_id=? LIMIT 1', [req.user.sub, req.user.org_id]);
      pid = op?.id || null;
    }
    // Super admins can send without a property_id (it becomes a system-wide message)
    // SECURITY FIX: this and every fallback below previously picked
    // "the first property in the whole system" / "the recipient's
    // property" with no org check — a broadcast could silently land
    // against another organisation's property. All scoped now.
    if (!pid && req.user.role === 'super_admin') {
      try {
        const [[fp]] = await pool.query('SELECT id FROM properties WHERE org_id=? LIMIT 1', [req.user.org_id]);
        pid = fp?.id || null;
      } catch (_) {}
    }
    // Last resort: if sending to a specific user and they have a property, use that
    if (!pid && to_user_id) {
      try {
        const [[recipient]] = await pool.query('SELECT property_id FROM users WHERE id=? AND org_id=?', [to_user_id, req.user.org_id]);
        if (recipient?.property_id) pid = recipient.property_id;
      } catch (_) {}
    }
    // If still no property_id, try to get ANY property in the caller's org
    if (!pid) {
      try {
        const [[anyProp]] = await pool.query('SELECT id FROM properties WHERE org_id=? LIMIT 1', [req.user.org_id]);
        pid = anyProp?.id || null;
      } catch (_) {}
    }
    if (!pid) return err(res, 'No property found. Please ensure properties are configured in the system.');

    // SECURITY FIX: a direct-message recipient was never checked against
    // the caller's org — could message a user in a different organisation.
    if (to_user_id) {
      const [[recipCheck]] = await pool.query('SELECT id FROM users WHERE id=? AND org_id=?', [to_user_id, req.user.org_id]);
      if (!recipCheck) return err(res, 'Recipient not found', 404);
    }

    const [r] = await pool.query(
      'INSERT INTO messages (property_id,from_user_id,to_user_id,subject,body) VALUES (?,?,?,?,?)',
      [pid, req.user.sub, to_user_id || null, subject || null, body]);

    // Notify direct recipient
    if (to_user_id) {
      await pool.query(
        'INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
        [to_user_id, 'message', `New message from ${req.user.name}`, subject || body.slice(0, 80), '/messages']);
    } else {
      // Broadcast: notify ALL active staff at the property (manager, caretaker, security, etc.)
      // excluding the sender
      const [staffList] = await pool.query(
        `SELECT DISTINCT u.id FROM users u
         WHERE u.is_active = 1 AND u.id != ?
           AND (
             u.property_id = ?
             OR u.id IN (SELECT manager_id FROM properties WHERE id = ? AND manager_id IS NOT NULL)
             OR u.id IN (SELECT owner_id  FROM properties WHERE id = ? AND owner_id  IS NOT NULL)
           )`,
        [req.user.sub, pid, pid, pid]);
      for (const s of staffList) {
        await pool.query(
          'INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
          [s.id, 'message', `📢 Message from ${req.user.name}`, subject || body.slice(0, 80), '/messages']
        ).catch(() => {});
      }
    }
    ok(res, { id: r.insertId, message: 'Message sent' }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.markRead = async (req, res) => {
  try {
    // BUG FIX: this used to run `UPDATE messages SET is_read=1 WHERE
    // id=? AND to_user_id=?` unconditionally — for a broadcast,
    // to_user_id is NULL, so that WHERE clause could never match and
    // broadcasts could never be marked read by anyone. Direct messages
    // still use messages.is_read; broadcasts now use message_reads,
    // which can hold one row per recipient instead of one shared flag.
    const [[msg]] = await pool.query(
      `SELECT m.id, m.to_user_id, m.property_id FROM messages m
       JOIN properties p ON m.property_id=p.id
       WHERE m.id=? AND p.org_id=?`, [req.params.id, req.user.org_id]);
    if (!msg) return err(res, 'Message not found', 404);

    if (msg.to_user_id !== null) {
      await pool.query('UPDATE messages SET is_read=1 WHERE id=? AND to_user_id=?', [msg.id, req.user.sub]);
    } else {
      // Same eligibility rule as getThread — only someone who's actually
      // allowed to see this property's broadcasts can mark one read.
      if (req.user.role !== 'super_admin') {
        const [[elig]] = await pool.query(
          `SELECT 1 AS ok FROM properties WHERE id=? AND (manager_id=? OR owner_id=?)
           UNION
           SELECT 1 AS ok FROM users WHERE id=? AND property_id=?
           LIMIT 1`,
          [msg.property_id, req.user.sub, req.user.sub, req.user.sub, msg.property_id]);
        if (!elig) return err(res, 'Message not found', 404);
      }
      await pool.query(
        `INSERT INTO message_reads (message_id, user_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
        [msg.id, req.user.sub]);
    }
    ok(res, { message: 'Marked as read' });
  } catch(e) { safeErr(res, e); }
};

exports.reply = async (req, res) => {
  try {
    const { body, to_user_id: explicitTo } = req.body;
    if (!body) return err(res, 'Reply body required');
    // SECURITY FIX: no org check — could reply into another
    // organisation's message thread by ID (messages has no org_id
    // column of its own, so scope via its property).
    const [[orig]] = await pool.query(
      `SELECT m.* FROM messages m JOIN properties p ON m.property_id=p.id
       WHERE m.id=? AND p.org_id=?`, [req.params.id, req.user.org_id]);
    if (!orig) return err(res, 'Original message not found', 404);

    let to;
    if (orig.from_user_id === req.user.sub) {
      if (orig.to_user_id !== null) {
        // Replying within your own direct-message thread — unambiguous.
        to = orig.to_user_id;
      } else {
        // BUG FIX: replying to your OWN broadcast used to fall through to
        // `orig.to_user_id`, which is NULL for a broadcast — silently
        // creating another to_user_id=NULL message. That message then got
        // blasted (via the notification loop below, as it used to be) to
        // every staff member who'd ever replied in the thread, even though
        // each of them has a separate, private conversation with you. Each
        // reply to a broadcast is its own 1:1 branch, so we can't infer a
        // recipient from `orig` alone here — the caller must say who.
        if (!explicitTo) {
          return err(res, 'This is a broadcast thread — specify who you are replying to (to_user_id)', 400);
        }
        const [[participant]] = await pool.query(
          'SELECT 1 FROM messages WHERE parent_id=? AND from_user_id=? LIMIT 1',
          [orig.id, explicitTo]);
        if (!participant) return err(res, 'That person has not replied in this thread', 400);
        to = explicitTo;
      }
    } else {
      // Anyone else replies privately to the original sender.
      to = orig.from_user_id;
    }

    const [r] = await pool.query(
      'INSERT INTO messages (property_id,from_user_id,to_user_id,subject,body,parent_id) VALUES (?,?,?,?,?,?)',
      [orig.property_id, req.user.sub, to, `Re: ${orig.subject || ''}`, body, orig.id]);

    // BUG FIX: this used to notify every historical participant across the
    // whole thread — so e.g. Caretaker A got a "new reply" notification
    // every time Caretaker B privately messaged the Manager, about a
    // conversation A isn't part of. A reply has exactly one recipient now
    // that `to` is always resolved to a specific person above, so notify
    // only them.
    if (to) {
      await pool.query(
        'INSERT INTO notifications (user_id,type,title,message,action_url) VALUES (?,?,?,?,?)',
        [to, 'message', `Reply from ${req.user.name}`, body.slice(0, 80), '/messages']
      ).catch(() => {});
    }

    ok(res, { id: r.insertId, message: 'Reply sent' }, 201);
  } catch(e) { safeErr(res, e); }
};

// GET /messages/staff — returns all users at the same property(ies) as the requester.
// Works for every role: caretaker, security, tenant, manager, admin, owner.
exports.getStaff = async (req, res) => {
  try {
    const uid  = req.user.sub;
    const role = req.user.role;
    let propertyIds = [];

    if (role === 'super_admin') {
      // SECURITY FIX: previously no org filter — a super_admin saw
      // every user across every organisation on the platform.
      const [rows] = await pool.query(
        `SELECT id, full_name, role, profile_photo, property_id
         FROM users WHERE is_active=1 AND org_id=? AND id != ? ORDER BY full_name`, [req.user.org_id, uid]);
      return ok(res, { staff: rows });
    }

    if (role === 'owner') {
      const [props] = await pool.query('SELECT id FROM properties WHERE owner_id=?', [uid]);
      propertyIds = props.map(p => p.id);
    } else if (role === 'property_manager') {
      const [props] = await pool.query('SELECT id FROM properties WHERE manager_id=?', [uid]);
      propertyIds = props.map(p => p.id);
    } else if (req.user.property_id) {
      // caretaker, security — assigned to one property
      propertyIds = [req.user.property_id];
    } else if (role === 'tenant') {
      // Tenant: get their active tenancy's property
      const [[t]] = await pool.query(
        `SELECT un.property_id FROM tenants t
         JOIN tenancies ten ON t.id = ten.tenant_id AND ten.status IN ('active','approved')
         JOIN units un ON ten.unit_id = un.id
         WHERE t.user_id = ? LIMIT 1`, [uid]);
      if (t) propertyIds = [t.property_id];
    }

    if (!propertyIds.length) return ok(res, { staff: [] });

    const placeholders = propertyIds.map(() => '?').join(',');

    // Staff: users assigned to these properties (any role)
    const [staff] = await pool.query(
      `SELECT DISTINCT u.id, u.full_name, u.role, u.profile_photo, u.property_id
       FROM users u
       WHERE u.is_active = 1
         AND u.id != ?
         AND (
           u.property_id IN (${placeholders})
           OR u.id IN (SELECT manager_id FROM properties WHERE id IN (${placeholders}) AND manager_id IS NOT NULL)
           OR u.id IN (SELECT owner_id  FROM properties WHERE id IN (${placeholders}) AND owner_id  IS NOT NULL)
         )
       ORDER BY
         FIELD(u.role,'super_admin','property_manager','owner','caretaker','security','tenant'),
         u.full_name`,
      [uid, ...propertyIds, ...propertyIds, ...propertyIds]);

    ok(res, { staff });
  } catch(e) { safeErr(res, e); }
};

// GET /messages/:id/thread — returns full thread (original + all replies)
exports.getThread = async (req, res) => {
  try {
    const msgId = req.params.id;
    // SECURITY FIX: no org check — could read any message thread in the
    // entire system by ID.
    const [[root]] = await pool.query(
      `SELECT m.* FROM messages m JOIN properties p ON m.property_id=p.id
       WHERE m.id=? AND p.org_id=?`, [msgId, req.user.org_id]);
    if (!root) return err(res, 'Message not found', 404);
    const rootId = root.parent_id || root.id;

    // BUG FIX: matching org was the ONLY check here — any authenticated
    // user could read ANY thread in their org by ID (or just by guessing
    // sequential IDs), including private 1:1 messages between two other
    // people they have nothing to do with. Require the caller to actually
    // be the sender, the recipient, or (for a broadcast) an eligible
    // recipient of that property's broadcasts.
    const isDirectParticipant = root.from_user_id === req.user.sub || root.to_user_id === req.user.sub;
    if (!isDirectParticipant) {
      const isBroadcast = root.to_user_id === null;
      let eligible = false;
      if (isBroadcast) {
        if (req.user.role === 'super_admin') {
          eligible = true;
        } else {
          const [[elig]] = await pool.query(
            `SELECT 1 AS ok FROM properties WHERE id=? AND (manager_id=? OR owner_id=?)
             UNION
             SELECT 1 AS ok FROM users WHERE id=? AND property_id=?
             LIMIT 1`,
            [root.property_id, req.user.sub, req.user.sub, req.user.sub, root.property_id]);
          eligible = !!elig;
        }
      }
      if (!eligible) return err(res, 'Message not found', 404);
    }

    // BUG FIX: this used to return every reply under the root with no
    // filtering, so a broadcast's private replies leaked across branches —
    // e.g. Caretaker A could see Caretaker B's private reply to the
    // Manager, and vice versa. Each reply to a broadcast is a separate,
    // private 1:1 conversation with the broadcaster; only show a reply to
    // its own sender/recipient. The root itself is always shown (its
    // visibility was already checked above) so everyone sees what the
    // broadcast/message actually said.
    const [thread] = await pool.query(
      `SELECT m.*,
         uf.full_name AS from_name, uf.role AS from_role, uf.profile_photo AS from_photo,
         ut.full_name AS to_name
       FROM messages m
       JOIN users uf ON m.from_user_id = uf.id
       LEFT JOIN users ut ON m.to_user_id = ut.id
       WHERE m.id = ?
          OR (m.parent_id = ? AND (m.from_user_id = ? OR m.to_user_id = ?))
       ORDER BY m.created_at ASC`,
      [rootId, rootId, req.user.sub, req.user.sub]);

    ok(res, { thread });
  } catch(e) { safeErr(res, e); }
};
