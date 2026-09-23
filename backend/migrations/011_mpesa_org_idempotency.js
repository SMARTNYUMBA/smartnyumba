'use strict';

/**
 * Migration 011 - M-Pesa organization/idempotency support
 *
 * Safely upgrades older databases by:
 * - Adding missing M-Pesa organization/callback columns
 * - Backfilling org_id from invoices where possible
 * - Ensuring required indexes safely
 */

module.exports = {
  name: '011_mpesa_org_idempotency',

  async up(pool) {

    // 1. Check that mpesa_transactions exists
    const [tables] = await pool.query(
      "SELECT TABLE_NAME " +
      "FROM INFORMATION_SCHEMA.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'mpesa_transactions'"
    );

    if (!tables.length) {
      console.log('[011] mpesa_transactions table does not exist; skipped');
      return;
    }

    // 2. Read existing columns
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME " +
      "FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'mpesa_transactions'"
    );

    const existing = new Set(
      cols.map(r => r.COLUMN_NAME.toLowerCase())
    );

    // 3. Add missing columns
    const add = async (name, definition) => {
      if (!existing.has(name.toLowerCase())) {
        await pool.query(
          `ALTER TABLE mpesa_transactions ADD COLUMN \`${name}\` ${definition}`
        );

        console.log(`[011] Added mpesa_transactions.${name}`);
        existing.add(name.toLowerCase());
      }
    };

    await add('org_id', 'INT NOT NULL DEFAULT 1');
    await add('raw_callback', 'JSON DEFAULT NULL');
    await add('result_code', 'INT DEFAULT NULL');
    await add('result_desc', 'VARCHAR(255) DEFAULT NULL');
    await add('mpesa_name', 'VARCHAR(150) DEFAULT NULL');
    await add('completed_at', 'DATETIME DEFAULT NULL');

    // 4. Backfill organization ID from invoices where possible
    await pool.query(
      "UPDATE mpesa_transactions mt " +
      "JOIN invoices i ON i.id = mt.invoice_id " +
      "SET mt.org_id = i.org_id " +
      "WHERE mt.invoice_id IS NOT NULL " +
      "AND (mt.org_id IS NULL OR mt.org_id = 1)"
    ).catch(e => {
      console.warn('[011] org_id backfill skipped:', e.message);
    });

    // 5. Helper to safely check/create indexes
    const ensureIndex = async (table, indexName, columns, unique = false) => {

      const [tableRows] = await pool.query(
        "SELECT TABLE_NAME " +
        "FROM INFORMATION_SCHEMA.TABLES " +
        "WHERE TABLE_SCHEMA = DATABASE() " +
        "AND TABLE_NAME = ?",
        [table]
      );

      if (!tableRows.length) {
        console.warn(`[011] Table ${table} does not exist; skipped ${indexName}`);
        return;
      }

      const [columnRows] = await pool.query(
        "SELECT COLUMN_NAME " +
        "FROM INFORMATION_SCHEMA.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() " +
        "AND TABLE_NAME = ?",
        [table]
      );

      const availableColumns = new Set(
        columnRows.map(r => r.COLUMN_NAME.toLowerCase())
      );

      const missingColumns = columns.filter(
        column => !availableColumns.has(column.toLowerCase())
      );

      if (missingColumns.length) {
        console.warn(
          `[011] Index ${indexName} skipped: missing column(s) ` +
          `${missingColumns.join(', ')} in ${table}`
        );
        return;
      }

      const [indexRows] = await pool.query(
        "SELECT INDEX_NAME " +
        "FROM INFORMATION_SCHEMA.STATISTICS " +
        "WHERE TABLE_SCHEMA = DATABASE() " +
        "AND TABLE_NAME = ? " +
        "AND INDEX_NAME = ?",
        [table, indexName]
      );

      if (indexRows.length) {
        return;
      }

      const quotedColumns = columns
        .map(column => `\`${column}\``)
        .join(', ');

      const keyword = unique ? 'UNIQUE INDEX' : 'INDEX';

      try {
        await pool.query(
          `ALTER TABLE \`${table}\` ` +
          `ADD ${keyword} \`${indexName}\` (${quotedColumns})`
        );

        console.log(
          `[011] Added ${unique ? 'unique ' : ''}index ${indexName} ` +
          `on ${table}(${columns.join(', ')})`
        );
      } catch (e) {
        console.warn(
          `[011] Index ${indexName} skipped: ${e.message}`
        );
      }
    };

    // 6. Ensure indexes safely
    await ensureIndex(
      'mpesa_transactions',
      'idx_mpesa_org_status',
      ['org_id', 'status']
    );

    await ensureIndex(
      'mpesa_transactions',
      'uq_mpesa_checkout',
      ['checkout_request_id'],
      true
    );

    await ensureIndex(
      'payments',
      'uq_payment_org_txn',
      ['org_id', 'transaction_code'],
      true
    );

    console.log('[011] M-Pesa organization/idempotency migration complete');
  },
};
