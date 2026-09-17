
-- ============================================================
-- SmartNyumba RMS - Complete Data Fix Migration
-- Run this in phpMyAdmin after applying the patch
-- ============================================================
USE smartnyumba;

-- 1. Fix users role enum to include 'owner'
ALTER TABLE users 
  MODIFY COLUMN role ENUM('super_admin','property_manager','tenant','caretaker','security','owner') NOT NULL DEFAULT 'tenant';

-- 2. Add missing columns to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo    VARCHAR(300) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS passport_number  VARCHAR(30)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS property_id      INT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_suspended     TINYINT(1)   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMP    NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspended_by     INT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT         DEFAULT NULL;

-- 3. Add missing columns to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS passport_number   VARCHAR(30)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(150) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_phone   VARCHAR(20)  DEFAULT NULL;

-- 4. Add missing columns to tenancies
ALTER TABLE tenancies
  ADD COLUMN IF NOT EXISTS billing_start_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_plan ENUM('monthly','quarterly','weekly','daily') DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS grace_period_days INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS penalty_rate DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS due_day TINYINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS move_in_checklist TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lease_document VARCHAR(300) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status_reason VARCHAR(255) DEFAULT NULL;

-- 5. Add missing columns to properties  
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS owner_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS management_fee_pct DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manager_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- 6. Add missing columns to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS month_year VARCHAR(7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS parent_invoice_id INT DEFAULT NULL;

-- 7. Ensure units table has floor column
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS floor VARCHAR(20) DEFAULT 'Floor 1';

-- 8. Create missing tables
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  token      VARCHAR(200) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tenant_ledger (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenancy_id  INT NOT NULL,
  type        ENUM('debit','credit') NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  description VARCHAR(300) DEFAULT NULL,
  ref_type    VARCHAR(50) DEFAULT NULL,
  ref_id      INT DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenancy_id) REFERENCES tenancies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS receipts (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  payment_id     INT NOT NULL UNIQUE,
  receipt_number VARCHAR(50) NOT NULL UNIQUE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  type        VARCHAR(50) DEFAULT 'general',
  title       VARCHAR(200) DEFAULT NULL,
  message     TEXT NOT NULL,
  is_read     TINYINT(1) DEFAULT 0,
  action_url  VARCHAR(300) DEFAULT NULL,
  property_id INT DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_read (is_read)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mpesa_transactions (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  checkout_request_id  VARCHAR(100) UNIQUE NOT NULL,
  invoice_id           INT NOT NULL,
  tenancy_id           INT NOT NULL,
  phone                VARCHAR(20) NOT NULL,
  amount               DECIMAL(12,2) NOT NULL,
  status               ENUM('pending','completed','failed','cancelled') DEFAULT 'pending',
  transaction_code     VARCHAR(20) DEFAULT NULL,
  result_code          VARCHAR(10) DEFAULT NULL,
  result_desc          TEXT DEFAULT NULL,
  initiated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at         TIMESTAMP NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT DEFAULT NULL,
  action     VARCHAR(100) NOT NULL,
  model      VARCHAR(100) NOT NULL,
  record_id  INT DEFAULT NULL,
  changes    TEXT DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_model (model)
) ENGINE=InnoDB;

-- 9. Insert/update all required settings
INSERT IGNORE INTO settings (setting_key, setting_value, description) VALUES
('mpesa_enabled',     '1',    'Enable M-Pesa STK push'),
('sms_enabled',       '0',    'Enable SMS via Africa Talking'),
('late_fees_enabled', '1',    'Enable late fee calculation'),
('auto_late_fees',    '1',    'Auto apply late fees'),
('late_fee_percent',  '5',    'Late fee percentage'),
('grace_period_days', '5',    'Grace period days'),
('auto_invoice_day',  '1',    'Day to auto-generate invoices'),
('currency',          'KES',  'System currency'),
('water_rate',        '80',   'Water rate KES/unit'),
('electricity_rate',  '120',  'Electricity rate KES/unit'),
('system_name',       'SmartNyumba Rental Management System', 'System name'),
('whatsapp_enabled',  '0',    'Enable WhatsApp'),
('owner_report_email','1',    'Email owner monthly report');

-- 10. Ensure owner user exists (password: Owner@123)
INSERT IGNORE INTO users (id, full_name, email, phone, password_hash, role, is_active)
VALUES (10, 'Mark Mutwiwa', 'owner@smartnyumba.com', '0715662332',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGwa6a5KtSPvZVj04WQOC.4vTOq', 'owner', 1);

-- 11. Backfill tenant_ledger from existing invoices
INSERT IGNORE INTO tenant_ledger (tenancy_id, type, amount, description, ref_type, ref_id, created_at)
SELECT tenancy_id, 'debit', amount, CONCAT(UPPER(type), ' invoice'), 'invoice', id, created_at
FROM invoices
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_ledger WHERE ref_type='invoice' AND ref_id=invoices.id
);

-- 12. Backfill receipts from existing payments
INSERT IGNORE INTO receipts (payment_id, receipt_number)
SELECT id, CONCAT('RCP-', YEAR(paid_at), '-', LPAD(id, 5, '0'))
FROM payments
WHERE NOT EXISTS (SELECT 1 FROM receipts WHERE payment_id=payments.id);

-- 13. Quick data verification
SELECT 'DATA CHECK' AS check_type;
SELECT 
  (SELECT COUNT(*) FROM units) AS units,
  (SELECT COUNT(*) FROM properties) AS properties,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM tenants) AS tenants,
  (SELECT COUNT(*) FROM tenancies WHERE status='active') AS active_tenancies,
  (SELECT COUNT(*) FROM invoices) AS invoices,
  (SELECT COUNT(*) FROM payments) AS payments;
