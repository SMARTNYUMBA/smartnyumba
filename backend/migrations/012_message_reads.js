'use strict';
/**
 * Migration 012 — Per-recipient read tracking for broadcast messages
 *
 * messages.is_read is a single column, which works for a direct message
 * (exactly one recipient) but can't represent a broadcast (to_user_id IS
 * NULL, many recipients) — there's no single "read" state to store. This
 * adds a join table so each recipient's read state for a broadcast is
 * tracked independently. Direct messages keep using messages.is_read,
 * unchanged.
 */
module.exports = {
  name: '012_message_reads',
  async up(pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_reads (
        message_id INT NOT NULL,
        user_id    INT NOT NULL,
        read_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id),
        INDEX idx_mr_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('[012] Created message_reads table');
  },
};
