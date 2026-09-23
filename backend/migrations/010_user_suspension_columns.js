'use strict';

/**
 * Migration 010 - User suspension columns
 *
 * Safely upgrades older databases by:
 * - Renaming suspend_reason -> suspension_reason when needed
 * - Adding missing suspension columns
 * - Adding the suspension index safely
 * - Creating webhook_deliveries if missing
 * - Adding webhooks.disabled_reason if missing
 */

module.exports = {
  version: 10,
  name: '010_user_suspension_columns',

  async up(pool) {

    // ------------------------------------------------------------
    // 1. Read current users columns
    // ------------------------------------------------------------
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME " +
      "FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'users'"
    );

    let existing = new Set(
      cols.map(r => r.COLUMN_NAME.toLowerCase())
    );


    // ------------------------------------------------------------
    // 2. Rename suspend_reason -> suspension_reason
    // ------------------------------------------------------------
    if (
      existing.has('suspend_reason') &&
      !existing.has('suspension_reason')
    ) {
      await pool.query(
        "ALTER TABLE users " +
        "CHANGE COLUMN suspend_reason suspension_reason TEXT NULL"
      );

      console.log(
        '[010] Renamed users.suspend_reason -> suspension_reason'
      );

      existing.delete('suspend_reason');
      existing.add('suspension_reason');
    }


    // ------------------------------------------------------------
    // 3. Add missing suspension columns
    // ------------------------------------------------------------
    const toAdd = [
      ['is_suspended',   'TINYINT(1) NOT NULL DEFAULT 0'],
      ['suspension_reason', 'TEXT NULL'],
      ['suspended_at',   'DATETIME NULL'],
      ['suspended_by',   'INT UNSIGNED NULL'],
    ];

    for (const [col, def] of toAdd) {
      if (!existing.has(col.toLowerCase())) {
        await pool.query(
          `ALTER TABLE users ADD COLUMN \`${col}\` ${def}`
        );

        console.log(`[010] Added users.${col}`);

        existing.add(col.toLowerCase());
      }
    }


    // ------------------------------------------------------------
    // 4. Ensure suspension index exists
    // ------------------------------------------------------------
    const [[idx]] = await pool.query(
      "SELECT INDEX_NAME " +
      "FROM INFORMATION_SCHEMA.STATISTICS " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'users' " +
      "AND INDEX_NAME = 'idx_users_suspended'"
    );

    if (!idx) {
      await pool.query(
        "ALTER TABLE users " +
        "ADD INDEX idx_users_suspended (is_suspended)"
      );

      console.log('[010] Added idx_users_suspended');
    }


    // ------------------------------------------------------------
    // 5. Ensure webhook_deliveries exists
    // ------------------------------------------------------------
    const [[deliveryTable]] = await pool.query(
      "SELECT TABLE_NAME " +
      "FROM INFORMATION_SCHEMA.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'webhook_deliveries'"
    );

    if (!deliveryTable) {
      await pool.query(`
        CREATE TABLE webhook_deliveries (
          id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          subscriber_id   INT             NOT NULL,
          event           VARCHAR(100)    NOT NULL,
          payload         JSON            NOT NULL,
          delivery_id     VARCHAR(36),
          attempt_number  TINYINT UNSIGNED DEFAULT 1,
          status          ENUM(
            'pending',
            'sending',
            'delivered',
            'failed'
          ) DEFAULT 'pending',
          deliver_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
          delivered_at    DATETIME,
          response_status SMALLINT,
          error           TEXT,
          created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_delivery (delivery_id),
          INDEX idx_pending (subscriber_id, status, deliver_at),
          FOREIGN KEY (subscriber_id)
            REFERENCES webhooks(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);

      console.log('[010] Created webhook_deliveries');
    }


    // ------------------------------------------------------------
    // 6. Ensure webhooks.disabled_reason exists
    // ------------------------------------------------------------
    const [[disabledReason]] = await pool.query(
      "SELECT COLUMN_NAME " +
      "FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'webhooks' " +
      "AND COLUMN_NAME = 'disabled_reason'"
    );

    if (!disabledReason) {
      await pool.query(
        "ALTER TABLE webhooks " +
        "ADD COLUMN disabled_reason VARCHAR(255) NULL"
      );

      console.log('[010] Added webhooks.disabled_reason');
    }


    console.log('[010] User suspension migration complete');
  },
};
