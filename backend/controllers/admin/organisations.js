'use strict';
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../../config/db');
const { ok, err, safeErr, rand, hashToken, setRefreshCookie, validatePhone, strongPassword } = require('../../utils/helpers');

const PLANS = {
  starter:      { price_monthly: 2999, max_units: 50,  max_users: 5,   max_properties: 3  },
  professional: { price_monthly: 9999, max_units: 500, max_users: 25,  max_properties: 20 },
  enterprise:   { price_monthly: 0,    max_units: 99999,max_users:9999,max_properties:9999},
};

/** GET /api/organisations/me — current org details */
exports.getMyOrg = async (req, res) => {
  try {
    const [[org]] = await pool.query('SELECT * FROM organisations WHERE id=?', [req.user.org_id]);
    if (!org) return err(res, 'Organisation not found', 404);

    // Usage counts
    const [[{ units }]]      = await pool.query('SELECT COUNT(*) AS units      FROM units       WHERE org_id=?',[req.user.org_id]);
    const [[{ users }]]      = await pool.query('SELECT COUNT(*) AS users      FROM users       WHERE org_id=?',[req.user.org_id]);
    const [[{ properties }]] = await pool.query('SELECT COUNT(*) AS properties FROM properties WHERE org_id=?',[req.user.org_id]);
    const [[{ sms_this_month }]] = await pool.query(
      "SELECT COALESCE(SUM(count),0) AS sms_this_month FROM sms_usage WHERE org_id=? AND month_year=DATE_FORMAT(NOW(),'%Y-%m')",
      [req.user.org_id]);

    ok(res, { org, usage: { units, users, properties, sms_this_month }, limits: PLANS[org.plan] });
  } catch(e) { safeErr(res, e); }
};

/** POST /api/organisations/register — self-service signup (PUBLIC) */
exports.register = async (req, res) => {
  try {
    const { org_name, plan='starter', owner_name, owner_email, owner_phone, owner_password } = req.body;
    if (!org_name || !owner_name || (!owner_email && !owner_phone) || !owner_password)
      return err(res, 'org_name, owner_name, owner_email/phone and owner_password are required');
    if (!strongPassword(owner_password))
      return err(res, 'Password must be 8+ characters with at least one uppercase letter and one number');
    if (owner_phone && !validatePhone(owner_phone))
      return err(res, 'Invalid phone number format. Use 07XX XXX XXX');

    // Generate unique slug
    let slug = org_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const [[existing]] = await pool.query('SELECT id FROM organisations WHERE slug=?',[slug]);
    if (existing) slug = slug + '-' + Date.now().toString(36);

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    let orgId, userId;
    try {
      const [orgRes] = await conn.query(
        `INSERT INTO organisations (slug,name,plan,plan_expires_at,max_units,max_users,max_properties,billing_email)
         VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 14 DAY),?,?,?,?)`,
        [slug, org_name, plan, PLANS[plan].max_units, PLANS[plan].max_users, PLANS[plan].max_properties, owner_email||null]
      );
      orgId = orgRes.insertId;

      const hash = await bcrypt.hash(owner_password, 12);
      const [uRes] = await conn.query(
        'INSERT INTO users (org_id,full_name,email,phone,password_hash,role,is_active) VALUES (?,?,?,?,?,?,1)',
        [orgId, owner_name, owner_email||null, owner_phone||null, hash, 'super_admin']
      );
      userId = uRes.insertId;

      await conn.query('UPDATE organisations SET owner_user_id=? WHERE id=?',[userId, orgId]);
      await conn.commit();
    } catch(e2) { await conn.rollback(); throw e2; }
    finally { conn.release(); }

    const payload = { sub: userId, name: owner_name, email: owner_email||null,
                      role: 'super_admin', org_id: orgId };
    const access  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refresh = rand(40);
    // FIX: same plaintext-storage / no-cookie gap as the login and MFA
    // token-issuance paths — see auth/index.js.
    await pool.query('INSERT INTO refresh_tokens (user_id,token,expires_at,ip,user_agent) VALUES (?,?,?,?,?)',
      [userId, hashToken(refresh), new Date(Date.now() + 7*86400000),
       (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0,45),
       (req.headers['user-agent']||'').slice(0,255)]);
    setRefreshCookie(res, refresh);

    // Welcome email (non-fatal)
    setImmediate(async () => {
      try {
        const email = require('../../services/email');
        await email.send({
          to: owner_email,
          subject: `Welcome to SmartNyumba Pro — ${org_name}`,
          html: `<h2>Welcome, ${owner_name}!</h2>
                 <p>Your organisation <strong>${org_name}</strong> has been created on the ${plan} plan.</p>
                 <p>You have a 14-day free trial. <a href="/billing">Activate your subscription</a> to continue after trial.</p>`,
        }).catch(()=>{});
      } catch {}
    });

    ok(res, {
      access_token: access,
      ...(process.env.NODE_ENV !== 'production' ? { refresh_token: refresh } : {}),
      org_id: orgId,
      onboarding_url: '/onboarding/step/1', message: 'Organisation created' }, 201);
  } catch(e) { safeErr(res, e); }
};

/** PATCH /api/organisations/me — update org settings */
exports.update = async (req, res) => {
  try {
    const { name, timezone, currency, logo_url, primary_colour, billing_email } = req.body;
    await pool.query(
      'UPDATE organisations SET name=COALESCE(?,name),timezone=COALESCE(?,timezone),currency=COALESCE(?,currency),logo_url=COALESCE(?,logo_url),primary_colour=COALESCE(?,primary_colour),billing_email=COALESCE(?,billing_email) WHERE id=?',
      [name||null, timezone||null, currency||null, logo_url||null, primary_colour||null, billing_email||null, req.user.org_id]
    );
    ok(res, { message: 'Organisation updated' });
  } catch(e) { safeErr(res, e); }
};

/** GET /api/brand — public, resolved by hostname, used for white-label */
exports.brand = async (req, res) => {
  try {
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    let [[org]] = await pool.query(
      'SELECT name,logo_url,primary_colour,billing_email FROM organisations WHERE custom_domain=? AND is_active=1 LIMIT 1',
      [host]);
    if (!org) {
      // Fall back to default branding
      org = { name: 'SmartNyumba Pro', logo_url: null, primary_colour: '#5b7fff', billing_email: null };
    }
    res.json({ ...org });
  } catch(e) { res.json({ name: 'SmartNyumba Pro', primary_colour: '#5b7fff' }); }
};

/** POST /api/organisations/me/logo — upload a logo file
 * BUG FIX: pages/admin/OrgSettings.jsx has a full "Choose file → Upload
 * logo" flow that posts multipart form data here — but this route never
 * existed anywhere in the backend (only PATCH /me existed, which accepts
 * a logo_url *string*, not a file). Every logo upload attempt 404'd.
 * Mirrors the existing users.js uploadPhoto pattern (multer diskStorage
 * + magic-byte verification, wired in routes/organisations.js).
 */
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) return err(res, 'No file uploaded');
    const logoUrl = `/uploads/logos/${req.file.filename}`;
    await pool.query('UPDATE organisations SET logo_url=? WHERE id=?', [logoUrl, req.user.org_id]);
    ok(res, { logo_url: logoUrl, message: 'Logo updated' });
  } catch(e) { safeErr(res, e); }
};

/** GET /api/organisations/audit — audit log for super_admin */
exports.auditLog = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)||1);
    const limit = Math.min(100, parseInt(req.query.limit)||50);
    let sql = 'SELECT * FROM audit_events WHERE org_id=?';
    const p = [req.user.org_id];
    if (req.query.actor_id) { sql += ' AND actor_id=?'; p.push(req.query.actor_id); }
    if (req.query.action)   { sql += ' AND action LIKE ?'; p.push('%'+req.query.action+'%'); }
    if (req.query.from)     { sql += ' AND created_at>=?'; p.push(req.query.from); }
    if (req.query.to)       { sql += ' AND created_at<=?'; p.push(req.query.to); }
    sql += ' ORDER BY created_at DESC';
    const { paginate } = require('../../utils/helpers');
    ok(res, await paginate(pool, sql, p, page, limit));
  } catch(e) { safeErr(res, e); }
};

/** GET /api/organisations/sessions — every currently-active login session
 * in this organisation (one row per session, not per user — a user can
 * be logged in on more than one device at once). A session is "active"
 * simply if its refresh token hasn't expired; there's no separate
 * revoked flag, so an expired/deleted row is the only way a session
 * stops being active. IP and user-agent are captured at the point each
 * token is issued (migrations/014_session_device_info.js) — note that
 * a token-refresh cycle issues a *new* row, so "logged in since" reflects
 * the most recent refresh, not necessarily when the user's continuous
 * session actually began. */
exports.activeSessions = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)||1);
    const limit = Math.min(100, parseInt(req.query.limit)||50);
    const sql = `
      SELECT rt.id, rt.user_id, rt.created_at AS logged_in_at, rt.expires_at,
        rt.ip, rt.user_agent,
        u.full_name, u.email, u.role, u.profile_photo
      FROM refresh_tokens rt
      JOIN users u ON rt.user_id = u.id
      WHERE rt.expires_at > NOW() AND u.org_id = ?
      ORDER BY rt.created_at DESC`;
    const { paginate } = require('../../utils/helpers');
    ok(res, await paginate(pool, sql, [req.user.org_id], page, limit));
  } catch(e) { safeErr(res, e); }
};

/** DELETE /api/organisations/sessions/:id — force-log-out one specific
 * session. Scoped through users.org_id so a super_admin can't revoke a
 * session belonging to a different organisation by guessing an ID. */
exports.revokeSession = async (req, res) => {
  try {
    const [r] = await pool.query(
      `DELETE rt FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id
       WHERE rt.id = ? AND u.org_id = ?`,
      [req.params.id, req.user.org_id]
    );
    if (r.affectedRows === 0) return err(res, 'Session not found', 404);
    ok(res, { message: 'Session revoked' });
  } catch(e) { safeErr(res, e); }
};
