'use strict';
/**
 * Email-based password reset flow.
 *
 * POST /api/auth/forgot-password  { email }
 *   → generates a signed token, stores hash in DB, sends a reset link via email
 *
 * POST /api/auth/reset-password-link  { token, new_password }
 *   → verifies token, sets new password, invalidates all sessions
 *
 * The token is a 48-byte hex string (cryptographically random).
 * We store the SHA-256 hash in the DB (never the raw token).
 * The link is:  <FRONTEND_URL>/reset-password?token=<rawToken>
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool   = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── Ensure the table exists (runs on first use) ───────────────
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used       TINYINT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prt_hash    (token_hash),
      INDEX idx_prt_user    (user_id),
      INDEX idx_prt_expires (expires_at)
    )
  `).catch(() => {}); // already exists — non-fatal
}

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res) => {
  try {
    await ensureTable();
    const { email } = req.body;
    if (!email) return err(res, 'email required', 400);

    const [[user]] = await pool.query(
      'SELECT id, full_name FROM users WHERE email=? AND is_active=1 LIMIT 1',
      [email.toLowerCase().trim()]);

    // Always respond OK to prevent email enumeration attacks
    if (!user) {
      return ok(res, { message: 'If that email is registered, a reset link has been sent.' });
    }

    // Invalidate any existing tokens for this user
    await pool.query('UPDATE password_reset_tokens SET used=1 WHERE user_id=?', [user.id]);

    // Generate token
    const rawToken  = crypto.randomBytes(48).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_EXPIRY_MS);

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)',
      [user.id, tokenHash, expiresAt]);

    // Send email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink   = `${frontendUrl}/reset-password?token=${rawToken}`;

    const emailSvc = require('../../services/email');
    await emailSvc.sendMail({
      to:      email,
      subject: 'SmartNyumba — Reset your password',
      html: `
        <p>Hello ${user.full_name},</p>
        <p>We received a request to reset your SmartNyumba password.</p>
        <p>
          <a href="${resetLink}" style="
            display:inline-block;padding:12px 24px;
            background:#0369a1;color:#fff;border-radius:6px;
            text-decoration:none;font-weight:600;">
            Reset my password
          </a>
        </p>
        <p>This link expires in <strong>1 hour</strong>.</p>
        <p>If you did not request this, you can safely ignore this email.
           Your password has not been changed.</p>
        <p style="font-size:12px;color:#64748b;">
          If the button doesn't work, paste this URL into your browser:<br>
          <code>${resetLink}</code>
        </p>
      `,
      text: `Hello ${user.full_name},\n\nReset your SmartNyumba password here:\n${resetLink}\n\nThis link expires in 1 hour.\n`,
    });

    global.logger?.info(`Password reset email sent to user ${user.id}`);
    ok(res, { message: 'If that email is registered, a reset link has been sent.' });
  } catch (e) {
    global.logger?.error('forgotPassword error: ' + e.message);
    err(res, 'Could not send reset email. Please try again.', 500);
  }
};

// POST /api/auth/reset-password-link
exports.resetPasswordByLink = async (req, res) => {
  try {
    await ensureTable();
    const { token, new_password } = req.body;
    if (!token || !new_password) return err(res, 'token and new_password required', 400);
    if (new_password.length < 8)  return err(res, 'Password must be at least 8 characters', 400);

    const tokenHash = hashToken(token);

    const [[record]] = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash=? AND used=0 AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]);

    if (!record) return err(res, 'This reset link is invalid or has expired. Please request a new one.', 401);

    // Set new password
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, record.user_id]);

    // Invalidate the token
    await pool.query('UPDATE password_reset_tokens SET used=1 WHERE id=?', [record.id]);

    // Invalidate all existing sessions (stolen refresh tokens can't be reused)
    await pool.query('DELETE FROM refresh_tokens WHERE user_id=?', [record.user_id]);

    global.logger?.info(`Password reset via email link for user ${record.user_id}`);
    ok(res, { message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (e) {
    global.logger?.error('resetPasswordByLink error: ' + e.message);
    err(res, e.message, 500);
  }
};
