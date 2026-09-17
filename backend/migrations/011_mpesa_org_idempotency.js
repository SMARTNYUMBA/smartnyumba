'use strict';

module.exports = {
  name: '011_mpesa_org_idempotency',
  async up(pool) {
    const [tables] = await pool.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='mpesa_transactions'"
    );
    if (!tables.length) return;

    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='mpesa_transactions'"
    );
    const existing = new Set(cols.map(r => r.COLUMN_NAME.toLowerCase()));
    const add = async (name, def) => { if (!existing.has(name)) await pool.query(`ALTER TABLE mpesa_transactions ADD COLUMN ${name} ${def}`); };
    await add('org_id', 'INT NOT NULL DEFAULT 1');
    await add('raw_callback', 'JSON DEFAULT NULL');
    await add('result_code', 'INT DEFAULT NULL');
    await add('result_desc', 'VARCHAR(255) DEFAULT NULL');
    await add('mpesa_name', 'VARCHAR(150) DEFAULT NULL');
    await add('completed_at', 'DATETIME DEFAULT NULL');

    await pool.query(`UPDATE mpesa_transactions mt JOIN invoices i ON i.id=mt.invoice_id SET mt.org_id=i.org_id WHERE mt.invoice_id IS NOT NULL AND (mt.org_id IS NULL OR mt.org_id=1)`).catch(() => {});
    await pool.query('CREATE INDEX IF NOT EXISTS idx_mpesa_org_status ON mpesa_transactions(org_id,status)').catch(() => {});
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_mpesa_checkout ON mpesa_transactions(checkout_request_id)').catch(() => {});
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_org_txn ON payments(org_id,transaction_code)').catch(() => {});
  },
};
