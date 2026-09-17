'use strict';
/**
 * Message queue utility — enqueue SMS/email/WhatsApp/push.
 * Messages are persisted to message_queue table and processed by cron every 2 minutes.
 * This ensures receipts are never lost when SMTP/Africa's Talking is temporarily down.
 */
const pool = require('../config/db');

const enqueue = async (opts) => {
  const { org_id = 1, type, recipient, subject, body, template, payload, send_after } = opts;
  try {
    await pool.query(
      `INSERT INTO message_queue (org_id,type,recipient,subject,body,template,payload,send_after)
       VALUES (?,?,?,?,?,?,?,?)`,
      [org_id, type, recipient, subject||null, body, template||null,
       payload ? JSON.stringify(payload) : null,
       send_after || new Date()]
    );
  } catch(e) {
    global.logger?.error('msgQueue.enqueue failed:', e.message);
    // Fallback: try to send immediately if queue insert fails
    try { await sendImmediate(opts); } catch {}
  }
};

const sendImmediate = async ({ type, recipient, subject, body, payload }) => {
  if (type === 'email') {
    const email = require('../services/email');
    return email.send({ to: recipient, subject: subject||'Notification', html: body });
  }
  if (type === 'sms') {
    const sms = require('../services/sms');
    return sms.send({ phone: recipient, message: body, ...(payload||{}) });
  }
  if (type === 'whatsapp') {
    const wa = require('../services/whatsapp');
    return wa.send({ phone: recipient, message: body, ...(payload||{}) });
  }
};

/** Process pending messages — called by cron every 2 minutes */
const processPending = async () => {
  const [pending] = await pool.query(
    `SELECT * FROM message_queue
     WHERE status='pending' AND attempts<3 AND send_after<=NOW()
     ORDER BY created_at ASC LIMIT 50`
  );
  for (const msg of pending) {
    try {
      await pool.query('UPDATE message_queue SET status=?,attempts=attempts+1 WHERE id=?',['running',msg.id]);
      await sendImmediate({
        type: msg.type, recipient: msg.recipient,
        subject: msg.subject, body: msg.body,
        payload: msg.payload ? JSON.parse(msg.payload) : {},
      });
      await pool.query('UPDATE message_queue SET status=?,sent_at=NOW() WHERE id=?',['sent',msg.id]);
    } catch(e) {
      const nextTry = new Date(Date.now() + Math.pow(2, msg.attempts+1) * 60000);
      await pool.query(
        'UPDATE message_queue SET status=?,error=?,send_after=? WHERE id=?',
        [msg.attempts+1 >= 3 ? 'failed' : 'pending', e.message, nextTry, msg.id]
      ).catch(()=>{});
    }
  }
  return pending.length;
};

module.exports = { enqueue, processPending };
