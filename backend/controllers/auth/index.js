// backend/controllers/auth/index.js  — BUG FIX
// Fix: updateProfile was writing passport_number to users table (column doesn't exist).
//      passport_number belongs in the tenants table.
//      Also: non-tenant users (manager, security, etc.) who have no tenants row
//      are handled gracefully — their passport_number update is simply skipped.

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const pool   = require('../../config/db');
const { ok, err, rand, hashToken, getCookie, safeErr,
        setRefreshCookie, clearRefreshCookie } = require('../../utils/helpers');

// AUDIT GAP FIX: logins/logouts were never recorded anywhere — the
// generic audit() middleware (middleware/audit.js) requires req.user to
// already be set, which login can't satisfy (you're not authenticated
// yet), and it only fires on 2xx responses anyway, so it could never
// have captured a *failed* login attempt even if that were fixed. A
// record of failed logins matters at least as much as successful ones
// for spotting brute-force/credential-stuffing attempts, so this logs
// both. Writes to the same audit_events table the existing Audit Log
// page already reads from — no new table, no new UI needed.
async function logAuthEvent(req, { action, actor_id = null, actor_role = null, actor_email = null, org_id = 1, status_code }) {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 45);
    await pool.query(
      `INSERT INTO audit_events (org_id,actor_id,actor_role,actor_email,action,resource,ip,user_agent,status_code)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [org_id, actor_id, actor_role, actor_email, action, 'auth', ip, (req.headers['user-agent']||'').slice(0,500), status_code]
    );
  } catch { /* never let audit logging break the actual auth flow */ }
}

exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return err(res, 'Email/phone and password are required', 400);

    const phone = identifier.trim();
    const phoneVariants = [phone];
    if (/^07\d{8}$/.test(phone))   phoneVariants.push('254' + phone.slice(1), '+254' + phone.slice(1));
    if (/^2547\d{8}$/.test(phone)) phoneVariants.push('0' + phone.slice(3), '+' + phone);
    if (/^\+2547\d{8}$/.test(phone)) phoneVariants.push('0' + phone.slice(4), phone.slice(1));

    const placeholders = phoneVariants.map(() => '?').join(',');
    const [[user]] = await pool.query(
      `SELECT id,full_name,email,phone,role,password_hash,is_active,is_suspended,suspension_reason,property_id,profile_photo,mfa_enabled,org_id,last_login FROM users WHERE (email=? OR phone IN(${placeholders})) AND is_active=1 LIMIT 1`,
      [phone.toLowerCase(), ...phoneVariants]
    );
    if (!user) {
      await logAuthEvent(req, { action: 'auth.login.failed', actor_email: identifier, status_code: 401 });
      return err(res, 'Invalid credentials', 401);
    }
    if (user.is_suspended) {
      await logAuthEvent(req, { action: 'auth.login.blocked_suspended', actor_id: user.id, actor_role: user.role, actor_email: user.email, org_id: user.org_id, status_code: 403 });
      return err(res, 'Your account has been suspended. Contact your administrator.', 403);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await logAuthEvent(req, { action: 'auth.login.failed', actor_id: user.id, actor_role: user.role, actor_email: user.email, org_id: user.org_id, status_code: 401 });
      return err(res, 'Invalid credentials', 401);
    }

    // ── MFA CHECK ─────────────────────────────────────────────
    if (user.mfa_enabled) {
      const tempToken = jwt.sign(
        { sub: user.id, type: 'mfa_pending' },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );
      await logAuthEvent(req, { action: 'auth.login.mfa_challenge', actor_id: user.id, actor_role: user.role, actor_email: user.email, org_id: user.org_id, status_code: 200 });
      try {
        const mfa = require('./mfa');
        await mfa.sendOtp(user.id, user.phone);
      } catch (mfaErr) {
        global.logger?.error('MFA OTP send failed:', mfaErr.message);
      }
      return res.json({
        success: true, requires_mfa: true,
        temp_token: tempToken,
        message: 'OTP sent to your registered phone number',
      });
    }
    // ── END MFA CHECK ─────────────────────────────────────────

    // Include org_id in JWT for multi-tenancy scoping
    const [[orgRow]] = await pool.query('SELECT org_id FROM users WHERE id=?',[user.id]).catch(()=>[[{org_id:1}]]);
    const payload = { sub: user.id, name: user.full_name, email: user.email,
                      role: user.role, property_id: user.property_id,
                      org_id: orgRow?.org_id || user.org_id || 1 };
    const access  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refresh = rand(40);
    // SECURITY FIX: store a hash, not the raw token — same reasoning as
    // password-reset tokens. A DB read (backup leak, SQLi elsewhere, etc.)
    // no longer hands over usable session tokens.
    await pool.query('INSERT INTO refresh_tokens (user_id,token,expires_at,ip,user_agent) VALUES (?,?,?,?,?)',
      [user.id, hashToken(refresh), new Date(Date.now() + 7 * 86400000),
       (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0,45),
       (req.headers['user-agent']||'').slice(0,255)]);
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]);
    setRefreshCookie(res, refresh);
    await logAuthEvent(req, { action: 'auth.login.success', actor_id: user.id, actor_role: user.role, actor_email: user.email, org_id: payload.org_id, status_code: 200 });

    let profile = {};
    if (user.role === 'tenant') {
      const [[p]] = await pool.query(`
        SELECT t.id AS tenant_id,t.id_number,t.passport_number,t.vehicle_plate,
          t.emergency_contact,t.emergency_phone,
          ten.id AS tenancy_id,ten.status AS tenancy_status,ten.rent_amount,
          ten.start_date,ten.end_date,ten.deposit,
          u.unit_number,u.id AS unit_id,pr.name AS property_name,pr.id AS property_id,
          pr.location AS property_address
        FROM tenants t
        LEFT JOIN tenancies ten ON t.id=ten.tenant_id AND ten.status IN ('active','approved','pending')
        LEFT JOIN units u ON ten.unit_id=u.id
        LEFT JOIN properties pr ON u.property_id=pr.id
        WHERE t.user_id=? LIMIT 1`, [user.id]);
      if (p) profile = p;
    } else if (user.property_id) {
      try {
        const [[prop]] = await pool.query('SELECT id,name,location FROM properties WHERE id=?', [user.property_id]);
        if (prop) { profile.property_name = prop.name; profile.property_id = prop.id; }
      } catch (_) {}
    }

    let ownerProfile = {};
    if (user.role === 'owner') {
      const [props] = await pool.query('SELECT id,name FROM properties WHERE owner_id=?', [user.id]);
      ownerProfile = { properties: props };
    }

    const { password_hash, ...safe } = user;
    ok(res, {
      access_token: access,
      // Dev/sandbox fallback only — production relies on the HttpOnly
      // cookie set above. Matches the fallback the frontend already expects.
      ...(process.env.NODE_ENV !== 'production' ? { refresh_token: refresh } : {}),
      expires_in: 3600,
      user: { ...safe, profile, ...(user.role === 'owner' ? { ownerProfile } : {}) },
    });
  } catch(e) { safeErr(res, e); }
};

exports.refresh = async (req, res) => {
  try {
    // Prefer the HttpOnly cookie; body fallback stays available for
    // dev/sandbox where the cookie isn't set (see setRefreshCookie above).
    const refresh_token = getCookie(req, 'refresh_token') || req.body?.refresh_token;
    if (!refresh_token) return err(res, 'refresh_token required', 401);

    const [[rt]] = await pool.query(
      `SELECT rt.*, u.id uid, u.full_name, u.email, u.role, u.property_id, u.org_id
       FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id
       WHERE rt.token = ? AND rt.expires_at > NOW() LIMIT 1`,
      [hashToken(refresh_token)]);
    if (!rt) { clearRefreshCookie(res); return err(res, 'Invalid or expired refresh token', 401); }

    // BUG FIX: org_id was missing from the reissued JWT here, even though
    // login's payload includes it. Every token refresh silently dropped
    // multi-tenant scoping until the user logged in again.
    const access = jwt.sign(
      { sub: rt.uid, name: rt.full_name, email: rt.email, role: rt.role,
        property_id: rt.property_id, org_id: rt.org_id },
      process.env.JWT_SECRET, { expiresIn: '1h' });

    const newRef = rand(40);
    await pool.query('DELETE FROM refresh_tokens WHERE token=?', [hashToken(refresh_token)]);
    await pool.query('INSERT INTO refresh_tokens (user_id,token,expires_at,ip,user_agent) VALUES (?,?,?,?,?)',
      [rt.user_id, hashToken(newRef), new Date(Date.now() + 7 * 86400000),
       (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0,45),
       (req.headers['user-agent']||'').slice(0,255)]);
    setRefreshCookie(res, newRef);

    ok(res, {
      access_token: access,
      ...(process.env.NODE_ENV !== 'production' ? { refresh_token: newRef } : {}),
      expires_in: 3600,
    });
  } catch(e) { safeErr(res, e); }
};

exports.logout = async (req, res) => {
  try {
    const refresh_token = getCookie(req, 'refresh_token') || req.body?.refresh_token;
    // Revoke the specific token presented (single-session logout)
    if (refresh_token) await pool.query('DELETE FROM refresh_tokens WHERE token=?', [hashToken(refresh_token)]);
    clearRefreshCookie(res);
    await logAuthEvent(req, { action: 'auth.logout', actor_id: req.user?.sub, actor_role: req.user?.role, actor_email: req.user?.email, org_id: req.user?.org_id, status_code: 200 });
    ok(res, { message: 'Logged out' });
  } catch(e) { safeErr(res, e); }
};

/** Revoke ALL refresh tokens for the authenticated user (log out all devices). */
exports.logoutAll = async (req, res) => {
  try {
    const { count } = await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id = ?', [req.user.sub]
    ).then(([r]) => ({ count: r.affectedRows }));
    await logAuthEvent(req, { action: 'auth.logout_all', actor_id: req.user.sub, actor_role: req.user.role, actor_email: req.user.email, org_id: req.user.org_id, status_code: 200 });
    ok(res, { message: `Logged out from ${count} session${count !== 1 ? 's' : ''}` });
  } catch(e) { safeErr(res, e); }
};

exports.me = async (req, res) => {
  try {
    // Base query — only columns guaranteed to exist
    // Safe base query — only columns that have always existed
    const [[user]] = await pool.query(
      'SELECT id,full_name,email,phone,role,property_id,profile_photo,last_login,created_at,mfa_enabled FROM users WHERE id=?',
      [req.user.sub]);
    if (!user) return err(res, 'User not found', 404);

    // Extended identity/emergency columns — safe to fail if DB not yet migrated
    const extCols = ['vehicle_plate','id_number','id_type','passport_number','emergency_contact','emergency_phone'];
    for (const col of extCols) {
      try {
        const [[ext]] = await pool.query(`SELECT ${col} FROM users WHERE id=?`, [req.user.sub]);
        if (ext) user[col] = ext[col] ?? null;
      } catch (_) { user[col] = null; }
    }

    let profile = {};
    if (user.role === 'tenant') {
      const [[p]] = await pool.query(`
        SELECT t.id AS tenant_id,t.id_number,t.passport_number,t.vehicle_plate,
          t.emergency_contact,t.emergency_phone,
          ten.id AS tenancy_id,ten.status AS tenancy_status,ten.rent_amount,
          ten.start_date,ten.end_date,ten.deposit,
          IFNULL(ten.payment_plan,'monthly') AS payment_plan,
          u.unit_number,u.id AS unit_id,pr.name AS property_name,pr.id AS property_id,
          pr.location AS property_address
        FROM tenants t
        LEFT JOIN tenancies ten ON t.id=ten.tenant_id AND ten.status IN ('active','approved','pending')
        LEFT JOIN units u ON ten.unit_id=u.id
        LEFT JOIN properties pr ON u.property_id=pr.id
        WHERE t.user_id=? LIMIT 1`, [user.id]);
      if (p) profile = p;
    } else if (user.property_id) {
      // Non-tenant staff: fetch their assigned property name
      try {
        const [[prop]] = await pool.query(
          'SELECT id, name, location FROM properties WHERE id=?', [user.property_id]);
        if (prop) {
          profile.property_name = prop.name;
          profile.property_address = prop.location;
          profile.property_id = prop.id;
        }
      } catch (_) {}
    }
    ok(res, { user: { ...user, profile } });
  } catch(e) { safeErr(res, e); }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return err(res, 'Both passwords required');
    if (new_password.length < 8) return err(res, 'Password must be at least 8 characters');
    const [[user]] = await pool.query('SELECT id,full_name,email,phone,role,is_active,is_suspended,property_id,profile_photo,mfa_enabled,org_id,last_login,created_at,password_hash FROM users WHERE id=?', [req.user.sub]);
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return err(res, 'Current password is incorrect');
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.sub]);
    ok(res, { message: 'Password updated' });
  } catch(e) { safeErr(res, e); }
};

// ── Profile update — works for ALL roles ─────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const {
      full_name, email, phone,
      emergency_contact, emergency_phone,
      passport_number, id_number, id_type,
      vehicle_plate,
    } = req.body;

    // 1. Always update base columns
    await pool.query(
      'UPDATE users SET full_name=COALESCE(?,full_name), phone=COALESCE(?,phone), email=COALESCE(?,email) WHERE id=?',
      [full_name || null, phone || null, email || null, req.user.sub]
    );

    // 2. Try to update extended profile columns (safe — skipped if not migrated yet)
    try {
      await pool.query(
        `UPDATE users SET
           id_number=COALESCE(?,id_number),
           id_type=COALESCE(?,id_type),
           passport_number=COALESCE(?,passport_number),
           emergency_contact=COALESCE(?,emergency_contact),
           emergency_phone=COALESCE(?,emergency_phone),
           vehicle_plate=COALESCE(?,vehicle_plate)
         WHERE id=?`,
        [id_number||null, id_type||null, passport_number||null, emergency_contact||null, emergency_phone||null,
         vehicle_plate ? vehicle_plate.toUpperCase() : null,
         req.user.sub]
      );
    } catch (_) { /* columns not yet added — run migration */ }

    // 3. Also sync into tenants table if this user has a tenant record
    const [[t]] = await pool.query('SELECT id FROM tenants WHERE user_id=?', [req.user.sub]);
    if (t) {
      await pool.query(
        `UPDATE tenants SET
           id_number=COALESCE(?,id_number),
           passport_number=COALESCE(?,passport_number),
           emergency_contact=COALESCE(?,emergency_contact),
           emergency_phone=COALESCE(?,emergency_phone),
           vehicle_plate=COALESCE(?,vehicle_plate)
         WHERE id=?`,
        [id_number||null, passport_number||null, emergency_contact||null, emergency_phone||null, vehicle_plate ? vehicle_plate.toUpperCase() : null, t.id]
      );
    }

    // 3. Return updated user (with safe fallback if columns not yet migrated)
    let updated;
    try {
      const [[u]] = await pool.query(
        `SELECT id,full_name,email,phone,role,property_id,profile_photo,
                id_number,id_type,passport_number,emergency_contact,emergency_phone,
                vehicle_plate,last_login,created_at
         FROM users WHERE id=?`,
        [req.user.sub]);
      updated = u;
    } catch (_) {
      const [[u]] = await pool.query(
        'SELECT id,full_name,email,phone,role,property_id,profile_photo,last_login,created_at FROM users WHERE id=?',
        [req.user.sub]);
      updated = u;
    }
    ok(res, { message: 'Profile updated', user: updated });
  } catch(e) { safeErr(res, e); }
};

exports.requestOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return err(res, 'Phone number required');
    const [[user]] = await pool.query(
      'SELECT id,full_name FROM users WHERE phone=? AND is_active=1 LIMIT 1', [phone.trim()]);
    if (!user) return err(res, 'No account found with that phone number', 404);
    // SECURITY FIX: Math.random() is not cryptographically secure and is
    // predictable given enough samples — the login MFA OTP (controllers/
    // auth/mfa.js) was already switched to crypto.randomInt for this
    // reason, but this separate password-reset OTP path was missed.
    const code    = String(crypto.randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query("UPDATE otp_codes SET used=1 WHERE user_id=? AND purpose='reset_password'", [user.id]);
    await pool.query('INSERT INTO otp_codes (phone,user_id,code,purpose,expires_at) VALUES (?,?,?,?,?)',
      [phone, user.id, code, 'reset_password', expires]);
    const sms = require('../../services/sms');
    await sms.send({ phone, message: `SmartNyumba: Your password reset code is ${code}. Valid 10 minutes. Do not share.`, type: 'otp', user_id: user.id });
    ok(res, { message: 'OTP sent to your phone', expires_in: 600 });
  } catch(e) { safeErr(res, e); }
};

exports.resetPassword = async (req, res) => {
  try {
    const { phone, otp, new_password } = req.body;
    if (!phone || !otp || !new_password) return err(res, 'Phone, OTP and new password required');
    if (new_password.length < 8) return err(res, 'Password must be at least 8 characters');
    const [[record]] = await pool.query(
      "SELECT * FROM otp_codes WHERE phone=? AND code=? AND used=0 AND expires_at>NOW() AND purpose='reset_password' ORDER BY created_at DESC LIMIT 1",
      [phone, otp]);
    if (!record) return err(res, 'Invalid or expired OTP', 401);
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, record.user_id]);
    await pool.query('UPDATE otp_codes SET used=1 WHERE id=?', [record.id]);
    ok(res, { message: 'Password reset successfully. You can now log in.' });
  } catch(e) { safeErr(res, e); }
};