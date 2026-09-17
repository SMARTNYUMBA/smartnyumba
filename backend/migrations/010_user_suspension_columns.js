/**
 * Migration 010 — User suspension columns
 *
 * Fixes the column name mismatch: auto_migrate.js created 'suspend_reason'
 * but all controllers reference 'suspension_reason'. This migration:
 *  1. Renames suspend_reason → suspension_reason (if old column exists)
 *  2. Adds any missing suspension columns
 *  3. Adds webhook_deliveries table with correct FK type
 */
module.exports = {
  version: 10,
  name: '010_user_suspension_columns',
  async up(pool) {
    // Step 1: Check which suspension columns currently exist
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
    );
    const existing = new Set(cols.map(r => r.COLUMN_NAME.toLowerCase()));

    // Step 2: Rename suspend_reason → suspension_reason if the old name exists
    if (existing.has('suspend_reason') && !existing.has('suspension_reason')) {
      await pool.query(
        'ALTER TABLE users CHANGE COLUMN suspend_reason suspension_reason TEXT NULL'
      ).catch(() => {});
    }

    // Step 3: Add any columns that are still missing
    const toAdd = [
      ['is_suspended',      'TINYINT(1) NOT NULL DEFAULT 0'],
      ['suspension_reason', 'TEXT NULL'],
      ['suspended_at',      'DATETIME NULL'],
      ['suspended_by',      'INT UNSIGNED NULL'],
    ];
    for (const [col, def] of toAdd) {
      if (!existing.has(col)) {
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col} ${def}`)
          .catch(() => {});
      }
    }

    // Step 4: Index for fast filtering on is_suspended
    await pool.query(
      'ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_suspended (is_suspended)'
    ).catch(() => {});

    // Step 5: webhook_deliveries — must use INT (not INT UNSIGNED) to match webhooks.id
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        subscriber_id   INT             NOT NULL,
        event           VARCHAR(100)    NOT NULL,
        payload         JSON            NOT NULL,
        delivery_id     VARCHAR(36),
        attempt_number  TINYINT UNSIGNED DEFAULT 1,
        status          ENUM('pending','sending','delivered','failed') DEFAULT 'pending',
        deliver_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        delivered_at    DATETIME,
        response_status SMALLINT,
        error           TEXT,
        created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY  uq_delivery  (delivery_id),
        INDEX       idx_pending  (subscriber_id, status, deliver_at),
        FOREIGN KEY (subscriber_id) REFERENCES webhooks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Step 6: disabled_reason on webhooks
    await pool.query(
      'ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS disabled_reason VARCHAR(255) NULL'
    ).catch(() => {});
  },
};
