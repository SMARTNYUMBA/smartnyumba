-- ============================================================
-- Smart Nyumba Pro — Migration v8: Fix Server Errors
-- Run this SQL in phpMyAdmin or MySQL CLI:
--   mysql -u root -p smartnyumba < migration_v8_bugfix.sql
--
-- Fixes:
--   1. mpesa_transactions.created_at missing → adds initiated_at + created_at
--   2. cron_logs.error_message missing → adds it (was named differently)
--   3. payments.invoice_id NOT NULL → make nullable for refunds/credits
--   4. messages subquery uses wrong column name → fixed in messages controller
--   5. access_log table if missing → creates it
--   6. security_log_* tables if missing → creates them
-- ============================================================

USE smartnyumba;

-- ── 1. mpesa_transactions — add missing timestamp columns ────
ALTER TABLE mpesa_transactions
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS initiated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS raw_callback  JSON DEFAULT NULL,
  ADD INDEX IF NOT EXISTS idx_mpesa_status (status),
  ADD INDEX IF NOT EXISTS idx_mpesa_created (created_at);

-- ── 2. cron_logs — add missing error_message column ──────────
-- (Previous migration may have created it with a different name)
ALTER TABLE cron_logs
  ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rows_affected INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note         TEXT DEFAULT NULL;

-- ── 3. payments.invoice_id — make nullable for refund entries ─
-- Deposit refunds and credits don't have an invoice
ALTER TABLE payments
  MODIFY COLUMN invoice_id INT DEFAULT NULL;

-- ── 4. Add submitted_by to maintenance_requests if missing ───
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS submitted_by INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sms_alerted  TINYINT(1) DEFAULT 0,
  ADD FOREIGN KEY IF NOT EXISTS fk_maint_submitted (submitted_by) REFERENCES users(id) ON DELETE SET NULL;

-- ── 5. access_log table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_log (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  unit_id      INT DEFAULT NULL,
  event_type   ENUM('entry','exit','denied','alarm','gate_open','gate_close',
                    'intercom','camera_motion','delivery','other') NOT NULL DEFAULT 'entry',
  actor_name   VARCHAR(150) DEFAULT NULL,
  vehicle_plate VARCHAR(20) DEFAULT NULL,
  camera_id    VARCHAR(50)  DEFAULT NULL,
  source       ENUM('manual','intercom','rfid','app','camera') DEFAULT 'manual',
  notes        TEXT DEFAULT NULL,
  logged_by    INT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (logged_by)   REFERENCES users(id),
  INDEX idx_al_property (property_id),
  INDEX idx_al_date     (created_at),
  INDEX idx_al_event    (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6. Security logbook tables ────────────────────────────────
CREATE TABLE IF NOT EXISTS security_log_incidents (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  property_id    INT NOT NULL,
  logged_by      INT NOT NULL,
  incident_type  VARCHAR(50)  DEFAULT 'general',
  description    TEXT NOT NULL,
  location       VARCHAR(200) DEFAULT NULL,
  severity       ENUM('minor','major','critical') DEFAULT 'minor',
  status         ENUM('open','investigating','resolved') DEFAULT 'open',
  occurred_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at    TIMESTAMP NULL DEFAULT NULL,
  resolved_by    INT DEFAULT NULL,
  resolution_notes TEXT DEFAULT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (logged_by)   REFERENCES users(id),
  INDEX idx_sli_property (property_id),
  INDEX idx_sli_date     (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS security_log_patrols (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  officer_id   INT NOT NULL,
  route        VARCHAR(300) DEFAULT NULL,
  notes        TEXT DEFAULT NULL,
  status       ENUM('completed','incomplete','issue_found') DEFAULT 'completed',
  patrol_start DATETIME DEFAULT NULL,
  patrol_end   DATETIME DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (officer_id)  REFERENCES users(id),
  INDEX idx_slp_property (property_id),
  INDEX idx_slp_date     (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS security_log_equipment (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  checked_by   INT NOT NULL,
  equipment    VARCHAR(200) NOT NULL,
  status       ENUM('ok','faulty','needs_service','missing') DEFAULT 'ok',
  notes        TEXT DEFAULT NULL,
  checked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (checked_by)  REFERENCES users(id),
  INDEX idx_sle_property (property_id),
  INDEX idx_sle_date     (checked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 7. deposit_refunds table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS deposit_refunds (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  tenancy_id        INT NOT NULL,
  gross_deposit     DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductions        JSON DEFAULT NULL,
  net_refund        DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes             TEXT DEFAULT NULL,
  status            ENUM('pending','paid','cancelled') DEFAULT 'pending',
  payment_reference VARCHAR(100) DEFAULT NULL,
  paid_at           TIMESTAMP NULL DEFAULT NULL,
  created_by        INT DEFAULT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenancy_id)  REFERENCES tenancies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_dr_tenancy (tenancy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 8. owner_remittances table ────────────────────────────────
CREATE TABLE IF NOT EXISTS owner_remittances (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  property_id     INT NOT NULL,
  period          VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  gross_revenue   DECIMAL(12,2) DEFAULT 0,
  expenses        DECIMAL(12,2) DEFAULT 0,
  management_fee  DECIMAL(12,2) DEFAULT 0,
  net_remittance  DECIMAL(12,2) DEFAULT 0,
  status          ENUM('pending','sent','paid') DEFAULT 'pending',
  payment_reference VARCHAR(100) DEFAULT NULL,
  notes           TEXT DEFAULT NULL,
  paid_at         TIMESTAMP NULL DEFAULT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  UNIQUE KEY uq_remittance (property_id, period),
  INDEX idx_or_property (property_id),
  INDEX idx_or_period   (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 9. maintenance_updates (comment trail) ────────────────────
CREATE TABLE IF NOT EXISTS maintenance_updates (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  request_id  INT NOT NULL,
  user_id     INT NOT NULL,
  note        TEXT NOT NULL,
  status      VARCHAR(30) DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 10. sms_logs — ensure exists ─────────────────────────────
CREATE TABLE IF NOT EXISTS sms_logs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT DEFAULT NULL,
  phone        VARCHAR(20) NOT NULL,
  message      TEXT NOT NULL,
  type         VARCHAR(50) DEFAULT 'custom',
  status       ENUM('pending','sent','failed') DEFAULT 'pending',
  provider_ref VARCHAR(100) DEFAULT NULL,
  cost         DECIMAL(8,4) DEFAULT 0,
  sent_at      TIMESTAMP NULL DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sms_user   (user_id),
  INDEX idx_sms_status (status),
  INDEX idx_sms_date   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 11. mfa_otps table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_otps (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL UNIQUE,
  otp_hash    VARCHAR(255) DEFAULT NULL,
  expires_at  DATETIME DEFAULT NULL,
  used        TINYINT(1) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 12. tenant_ledger — ensure exists ────────────────────────
CREATE TABLE IF NOT EXISTS tenant_ledger (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  tenancy_id   INT NOT NULL,
  type         ENUM('debit','credit') NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  description  VARCHAR(255) DEFAULT NULL,
  ref_type     VARCHAR(50) DEFAULT NULL,
  ref_id       INT DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenancy_id) REFERENCES tenancies(id) ON DELETE CASCADE,
  INDEX idx_ledger_tenancy (tenancy_id),
  INDEX idx_ledger_date    (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 13. receipts — ensure exists ─────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  payment_id     INT NOT NULL UNIQUE,
  receipt_number VARCHAR(30) NOT NULL UNIQUE,
  issued_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 14. case_comments — ensure exists ────────────────────────
CREATE TABLE IF NOT EXISTS case_comments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  case_id    INT NOT NULL,
  user_id    INT NOT NULL,
  comment    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_cc_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 15. maintenance_schedules — ensure exists ─────────────────
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  property_id    INT NOT NULL,
  title          VARCHAR(200) NOT NULL,
  category       VARCHAR(50)  DEFAULT 'other',
  frequency_days INT NOT NULL DEFAULT 30,
  next_due       DATE DEFAULT NULL,
  is_active      TINYINT(1) DEFAULT 1,
  created_by     INT DEFAULT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 16. shared_meters + shared_meter_units ────────────────────
CREATE TABLE IF NOT EXISTS shared_meters (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  property_id    INT NOT NULL,
  name           VARCHAR(150) NOT NULL,
  utility_type   ENUM('water','electricity') NOT NULL,
  split_method   ENUM('equal','custom') DEFAULT 'equal',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shared_meter_units (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  meter_id   INT NOT NULL,
  unit_id    INT NOT NULL,
  share_pct  DECIMAL(5,2) DEFAULT NULL,
  FOREIGN KEY (meter_id) REFERENCES shared_meters(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id)  REFERENCES units(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 17. system_alerts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_alerts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT DEFAULT NULL,
  title       VARCHAR(200) NOT NULL,
  message     TEXT NOT NULL,
  severity    ENUM('info','warning','critical') DEFAULT 'info',
  raised_by   INT DEFAULT NULL,
  is_resolved TINYINT(1) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  FOREIGN KEY (raised_by)   REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Verify all fixes applied ──────────────────────────────────
SELECT 'migration_v8 complete' AS status,
       (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='mpesa_transactions' AND COLUMN_NAME='created_at') AS mpesa_created_at_ok,
       (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cron_logs' AND COLUMN_NAME='error_message') AS cron_error_message_ok,
       (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='invoice_id') AS payments_invoice_nullable;
