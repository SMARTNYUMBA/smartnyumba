-- Performance indexes for SmartNyumba
-- Run once: mysql -u root -p smartnyumba < add_indexes.sql

ALTER TABLE tenancies      ADD INDEX IF NOT EXISTS idx_ten_status    (status);
ALTER TABLE tenancies      ADD INDEX IF NOT EXISTS idx_ten_tenant     (tenant_id);
ALTER TABLE tenancies      ADD INDEX IF NOT EXISTS idx_ten_unit       (unit_id);
ALTER TABLE invoices       ADD INDEX IF NOT EXISTS idx_inv_status     (status);
ALTER TABLE invoices       ADD INDEX IF NOT EXISTS idx_inv_tenancy    (tenancy_id);
ALTER TABLE invoices       ADD INDEX IF NOT EXISTS idx_inv_due        (due_date);
ALTER TABLE payments       ADD INDEX IF NOT EXISTS idx_pay_tenancy    (tenancy_id);
ALTER TABLE payments       ADD INDEX IF NOT EXISTS idx_pay_date       (paid_at);
ALTER TABLE notifications  ADD INDEX IF NOT EXISTS idx_notif_user     (user_id, is_read);
ALTER TABLE maintenance_requests ADD INDEX IF NOT EXISTS idx_mr_status   (status);
ALTER TABLE maintenance_requests ADD INDEX IF NOT EXISTS idx_mr_property (property_id);
ALTER TABLE visitors       ADD INDEX IF NOT EXISTS idx_vis_checkin    (check_in);
ALTER TABLE visitors       ADD INDEX IF NOT EXISTS idx_vis_property   (property_id);
ALTER TABLE users          ADD INDEX IF NOT EXISTS idx_usr_role       (role);
ALTER TABLE units          ADD INDEX IF NOT EXISTS idx_unit_property  (property_id);
ALTER TABLE expenses       ADD INDEX IF NOT EXISTS idx_exp_property   (property_id);
ALTER TABLE expenses       ADD INDEX IF NOT EXISTS idx_exp_date       (expense_date);
