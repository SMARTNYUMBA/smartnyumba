'use strict';

module.exports = {
  name: '002_performance_indexes',
  async up(pool) {
    const indexes = [
      ['users',          'idx_users_email',    'email'],
      ['users',          'idx_users_phone',    'phone'],
      ['users',          'idx_users_role',     'role'],
      ['refresh_tokens', 'idx_rt_token',       'token'],
      ['refresh_tokens', 'idx_rt_expires',     'expires_at'],
      ['invoices',       'idx_inv_tenancy',    'tenancy_id'],
      ['invoices',       'idx_inv_status',     'status'],
      ['invoices',       'idx_inv_due',        'due_date'],
      ['payments',       'idx_pay_tenancy',    'tenancy_id'],
      ['payments',       'idx_pay_invoice',    'invoice_id'],
      ['payments',       'idx_pay_txcode',     'transaction_code'],
      ['tenancies',      'idx_ten_tenant',     'tenant_id'],
      ['tenancies',      'idx_ten_unit',       'unit_id'],
      ['tenancies',      'idx_ten_status',     'status'],
      ['notifications',  'idx_notif_user',     'user_id'],
      ['otp_codes',      'idx_otp_user',       'user_id'],
      ['audit_log',      'idx_audit_user',     'user_id'],
      ['audit_log',      'idx_audit_created',  'created_at'],
    ];

    let [tables] = await pool.query(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()'
    );
    const tableSet = new Set(tables.map(t => t.TABLE_NAME.toLowerCase()));

    let [idxRows] = await pool.query(
      'SELECT TABLE_NAME, INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE()'
    );
    const existing = new Set(idxRows.map(r => `${r.TABLE_NAME}:${r.INDEX_NAME}`));

    for (const [table, indexName, column] of indexes) {
      if (!tableSet.has(table)) continue;
      if (existing.has(`${table}:${indexName}`)) continue;
      await pool.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (\`${column}\`)`)
        .catch(() => {});
    }
  },
};
