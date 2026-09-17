'use strict';
/**
 * Migration 014 — Capture device/IP on login sessions
 *
 * The Active Sessions page (added in migration/feature work this
 * session) could only show who's logged in and since when — not from
 * where, since refresh_tokens never captured a device or IP at all.
 * This adds the columns; controllers/auth/index.js and mfa.js are
 * updated to populate them at the point a refresh token is issued.
 */
module.exports = {
  name: '014_session_device_info',
  async up(pool) {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens'`
    );
    const have = new Set(cols.map(c => c.COLUMN_NAME));

    if (!have.has('ip')) {
      await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN ip VARCHAR(45) DEFAULT NULL`);
    }
    if (!have.has('user_agent')) {
      await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN user_agent VARCHAR(255) DEFAULT NULL`);
    }
  },
};
