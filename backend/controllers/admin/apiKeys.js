'use strict';
const crypto = require('crypto');
const pool   = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.list = async (req, res) => {
  try {
    const [keys] = await pool.query(
      'SELECT id,name,key_prefix,role,scopes,last_used,expires_at,is_active,created_at FROM api_keys WHERE org_id=? ORDER BY created_at DESC',
      [req.user.org_id]);
    ok(res, { keys });
  } catch(e) { safeErr(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { name, role='api_reader', scopes, expires_days } = req.body;
    if (!name) return err(res, 'name is required');
    const validRoles = ['api_reader','api_writer','property_manager','super_admin'];
    if (!validRoles.includes(role)) return err(res, `role must be one of: ${validRoles.join(', ')}`);

    // Generate: snp_live_ prefix + 40 random hex chars
    const raw    = 'snp_live_' + crypto.randomBytes(20).toString('hex');
    const hash   = crypto.createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 12); // "snp_live_XX" — shown in UI for identification
    const exp    = expires_days ? new Date(Date.now() + expires_days * 86400000) : null;

    const [r] = await pool.query(
      'INSERT INTO api_keys (org_id,name,key_hash,key_prefix,role,scopes,expires_at,created_by) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.org_id, name, hash, prefix, role, scopes ? JSON.stringify(scopes) : null, exp, req.user.sub]
    );
    // Return full key ONCE — never stored in plaintext
    ok(res, { id: r.insertId, key: raw, key_prefix: prefix, message: 'Store this key — it will not be shown again.' }, 201);
  } catch(e) { safeErr(res, e); }
};

exports.revoke = async (req, res) => {
  try {
    const [[key]] = await pool.query('SELECT id FROM api_keys WHERE id=? AND org_id=?',
      [req.params.id, req.user.org_id]);
    if (!key) return err(res, 'Key not found', 404);
    await pool.query('UPDATE api_keys SET is_active=0 WHERE id=?', [req.params.id]);
    ok(res, { message: 'API key revoked' });
  } catch(e) { safeErr(res, e); }
};
