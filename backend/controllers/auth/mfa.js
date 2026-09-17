// backend/controllers/auth/mfa.js
// Two-Factor Authentication via SMS OTP
//
// New auth routes:
//   POST /api/auth/mfa/enable    — enable MFA for current user (sends test OTP)
//   POST /api/auth/mfa/disable   — disable MFA
//   POST /api/auth/mfa/verify    — verify OTP after password login
//
// Flow:
//   1. POST /api/auth/login  → if user has mfa_enabled=1, returns { requires_mfa: true, temp_token }
//   2. POST /api/auth/mfa/verify { temp_token, otp } → returns full access_token + refresh_token

const pool  = require('../../config/db');
const jwt   = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { ok, err, rand, hashToken, setRefreshCookie, safeErr } = require('../../utils/helpers');
const sms   = require('../../services/sms');

// AUDIT GAP FIX: see the matching helper + comment in controllers/auth/index.js
// — this is the completion of an MFA login (the actual session gets
// issued here, not in login()), so it needs its own log point.
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

// SECURITY FIX: Math.random() is not cryptographically secure and is
// predictable given enough samples — inappropriate for an auth code.
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

// ── Send OTP to user ──────────────────────────────────────────
async function sendOtp(userId, phone) {
  const otp     = generateOtp();
  const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  const hash    = await bcrypt.hash(otp, 8);

  // Store in mfa_otps table (create if needed)
  await pool.query(
    `INSERT INTO mfa_otps (user_id, otp_hash, expires_at, used)
     VALUES (?,?,?,0)
     ON DUPLICATE KEY UPDATE otp_hash=VALUES(otp_hash), expires_at=VALUES(expires_at), used=0`,
    [userId, hash, expires]).catch(async () => {
      // Table may not exist — create it
      await pool.query(`CREATE TABLE IF NOT EXISTS mfa_otps (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL UNIQUE,
        otp_hash   VARCHAR(255),
        expires_at DATETIME,
        used       TINYINT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      await pool.query(
        'INSERT INTO mfa_otps (user_id,otp_hash,expires_at,used) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE otp_hash=VALUES(otp_hash),expires_at=VALUES(expires_at),used=0',
        [userId, hash, expires]);
    });

  await sms.send({
    phone,
    user_id: userId,
    type: 'mfa_otp',
    message: `SmartNyumba security code: ${otp}. Valid for 5 minutes. Do not share this code.`,
  });

  return true;
}

// ── POST /api/auth/mfa/enable ─────────────────────────────────
exports.enable = async (req, res) => {
  try {
    const [[user]] = await pool.query('SELECT id,phone,mfa_enabled FROM users WHERE id=?', [req.user.sub]);
    if (!user.phone) return err(res, 'A phone number is required to enable 2FA');
    if (user.mfa_enabled) return err(res, '2FA is already enabled');

    await sendOtp(user.id, user.phone);
    ok(res, { message: 'OTP sent to your phone. Verify to activate 2FA.' });
  } catch(e) { safeErr(res, e); }
};

// ── POST /api/auth/mfa/confirm-enable { otp } ─────────────────
exports.confirmEnable = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return err(res, 'OTP required');

    const [[record]] = await pool.query(
      'SELECT * FROM mfa_otps WHERE user_id=? AND used=0 AND expires_at > NOW()',
      [req.user.sub]).catch(() => [[null]]);

    if (!record) return err(res, 'OTP expired or not found. Request a new one.');
    const valid = await bcrypt.compare(otp, record.otp_hash);
    if (!valid) return err(res, 'Invalid OTP');

    await pool.query('UPDATE users SET mfa_enabled=1 WHERE id=?', [req.user.sub]);
    await pool.query('UPDATE mfa_otps SET used=1 WHERE user_id=?', [req.user.sub]);
    ok(res, { message: '2FA enabled successfully' });
  } catch(e) { safeErr(res, e); }
};

// ── POST /api/auth/mfa/disable ────────────────────────────────
exports.disable = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return err(res, 'Current password required to disable 2FA');
    const [[user]] = await pool.query('SELECT password_hash FROM users WHERE id=?', [req.user.sub]);
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return err(res, 'Incorrect password');

    await pool.query('UPDATE users SET mfa_enabled=0 WHERE id=?', [req.user.sub]);
    ok(res, { message: '2FA disabled' });
  } catch(e) { safeErr(res, e); }
};

// ── POST /api/auth/mfa/verify { temp_token, otp } ────────────
exports.verify = async (req, res) => {
  try {
    const { temp_token, otp } = req.body;
    if (!temp_token || !otp) return err(res, 'temp_token and otp required');

    let decoded;
    try {
      decoded = jwt.verify(temp_token, process.env.JWT_SECRET);
    } catch {
      return err(res, 'Invalid or expired session. Please log in again.', 401);
    }

    if (decoded.type !== 'mfa_pending') return err(res, 'Invalid token type', 401);

    const [[record]] = await pool.query(
      'SELECT * FROM mfa_otps WHERE user_id=? AND used=0 AND expires_at > NOW()',
      [decoded.sub]).catch(() => [[null]]);

    if (!record) return err(res, 'OTP expired. Please log in again.', 401);
    const valid = await bcrypt.compare(otp, record.otp_hash);
    if (!valid) {
      await logAuthEvent(req, { action: 'auth.mfa.invalid_otp', actor_id: decoded.sub, status_code: 401 });
      return err(res, 'Invalid OTP. Please try again.', 401);
    }

    await pool.query('UPDATE mfa_otps SET used=1 WHERE user_id=?', [decoded.sub]);

    // Issue full access + refresh tokens
    // FIX: this path had the same issues the password-login path had —
    // refresh token stored in plaintext and never set as an HttpOnly
    // cookie, plus org_id missing from the JWT (breaks multi-tenant
    // scoping for any user with MFA enabled). Fixed to match login/refresh.
    const [[user]] = await pool.query('SELECT * FROM users WHERE id=?', [decoded.sub]);
    const payload  = { sub: user.id, name: user.full_name, email: user.email,
                        role: user.role, property_id: user.property_id, org_id: user.org_id };
    const access   = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refresh  = rand(40);
    await pool.query('INSERT INTO refresh_tokens (user_id,token,expires_at,ip,user_agent) VALUES (?,?,?,?,?)',
      [user.id, hashToken(refresh), new Date(Date.now() + 7 * 86400000),
       (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0,45),
       (req.headers['user-agent']||'').slice(0,255)]);
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]);
    setRefreshCookie(res, refresh);
    await logAuthEvent(req, { action: 'auth.login.success', actor_id: user.id, actor_role: user.role, actor_email: user.email, org_id: user.org_id, status_code: 200 });

    ok(res, {
      access_token: access,
      ...(process.env.NODE_ENV !== 'production' ? { refresh_token: refresh } : {}),
    });
  } catch(e) { safeErr(res, e); }
};

// ── POST /api/auth/mfa/resend ─────────────────────────────────
exports.resend = async (req, res) => {
  try {
    const { temp_token } = req.body;
    if (!temp_token) return err(res, 'temp_token required');
    let decoded;
    try { decoded = jwt.verify(temp_token, process.env.JWT_SECRET); }
    catch { return err(res, 'Invalid or expired session', 401); }

    const [[user]] = await pool.query('SELECT id,phone FROM users WHERE id=?', [decoded.sub]);
    if (!user.phone) return err(res, 'No phone number on file');
    await sendOtp(user.id, user.phone);
    ok(res, { message: 'New OTP sent' });
  } catch(e) { safeErr(res, e); }
};

module.exports.sendOtp = sendOtp;