'use strict';
module.exports = {
  name: '008_performance_indexes_v2',
  async up(pool) {
    const addIdx = async (table, name, cols) => {
      const [[ex]] = await pool.query(
        'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?',
        [table, name]);
      if (ex) return;
      const [[t]] = await pool.query(
        'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
      if (!t) return;
      await pool.query(`ALTER TABLE ${table} ADD INDEX ${name} (${cols})`).catch(()=>{});
    };
    await addIdx('invoices','idx_inv_org_status_due','org_id,status,due_date');
    await addIdx('invoices','idx_inv_org_tenancy','org_id,tenancy_id,status');
    await addIdx('payments','idx_pay_org_paid','org_id,paid_at');
    await addIdx('payments','idx_pay_org_tenancy','org_id,tenancy_id,paid_at');
    await addIdx('maintenance_requests','idx_mr_org_prop','org_id,property_id,status');
    await addIdx('maintenance_requests','idx_mr_org_assigned','org_id,assigned_to,status');
    await addIdx('tenancies','idx_ten_org_end','org_id,status,end_date');
    await addIdx('users','idx_usr_org_role','org_id,role,is_active');
    await addIdx('properties','idx_prop_org_mgr','org_id,manager_id');
    await addIdx('units','idx_units_org_prop','org_id,property_id,status');
  },
};
