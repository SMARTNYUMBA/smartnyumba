const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30',
      [req.user.sub]);
    const unread = rows.filter(n => !n.is_read).length;
    ok(res, { notifications: rows, unread });
  } catch(e) { safeErr(res, e); }
};

exports.markAllRead = async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0', [req.user.sub]);
    const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50', [req.user.sub]);
    ok(res, { notifications: rows, unread: 0 });
  } catch(e) { err(res, e.message, 500); }
};

exports.markRead = async (req, res) => {
  try {
    if (req.params.id === 'all') {
      await pool.query('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.sub]);
    } else {
      await pool.query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [req.params.id, req.user.sub]);
    }
    ok(res, { message: 'Marked as read' });
  } catch(e) { safeErr(res, e); }
};

// Internal helper — call from other controllers
async function notify(pool, { user_id, type, title, message, action_url, property_id }) {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id,type,title,message,action_url,property_id) VALUES (?,?,?,?,?,?)',
      [user_id, type||'general', title||null, message, action_url||null, property_id||null]
    );
  } catch (_) {}
}

module.exports = { getAll: exports.getAll, markRead: exports.markRead, markAllRead: exports.markAllRead, notify };
