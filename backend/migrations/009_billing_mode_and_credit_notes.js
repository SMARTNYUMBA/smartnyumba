'use strict';
/**
 * Migration 009 — Billing mode + credit notes support
 * - Adds billing_mode ENUM to tenancies (auto | manual)
 * - Adds parent_invoice_id to invoices (for credit note links)
 * - Adds month_year to invoices (for bulk reverse filtering)
 */
module.exports = {
  name: '009_billing_mode_and_credit_notes',
  async up(pool) {
    // billing_mode on tenancies
    const [[bm]] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tenancies' AND COLUMN_NAME='billing_mode'"
    );
    if (!bm) {
      await pool.query(
        "ALTER TABLE tenancies ADD COLUMN billing_mode ENUM('auto','manual') NOT NULL DEFAULT 'auto' AFTER status"
      );
      console.log('[009] Added billing_mode to tenancies');
    }

    // parent_invoice_id on invoices (for credit notes)
    const [[pi]] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoices' AND COLUMN_NAME='parent_invoice_id'"
    );
    if (!pi) {
      await pool.query(
        'ALTER TABLE invoices ADD COLUMN parent_invoice_id INT DEFAULT NULL AFTER notes'
      );
      console.log('[009] Added parent_invoice_id to invoices');
    }

    // month_year computed helper column (for bulk reverse by month)
    const [[my]] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoices' AND COLUMN_NAME='month_year'"
    );
    if (!my) {
      await pool.query(
        "ALTER TABLE invoices ADD COLUMN month_year CHAR(7) GENERATED ALWAYS AS (DATE_FORMAT(due_date,'%Y-%m')) STORED"
      );
      await pool.query(
        "ALTER TABLE invoices ADD INDEX idx_inv_month_year (month_year)"
      ).catch(() => {});
      console.log('[009] Added month_year to invoices');
    }
  },
};
