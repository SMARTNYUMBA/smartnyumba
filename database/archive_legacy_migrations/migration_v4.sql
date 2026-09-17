
-- SmartNyumba RMS — Migration v4 (Commercial Release)
USE smartnyumba;

-- ── OWNER/LANDLORD ────────────────────────────────────────────────────────
-- Add 'owner' and 'landlord' to user roles
ALTER TABLE users MODIFY role ENUM('super_admin','property_manager','tenant','caretaker','security','owner') NOT NULL;

-- Link properties to owners
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS owner_id INT DEFAULT NULL COMMENT 'owner user id',
  ADD COLUMN IF NOT EXISTS management_fee_pct DECIMAL(5,2) DEFAULT 0 COMMENT 'agency fee %';

-- Owner remittance statements
CREATE TABLE IF NOT EXISTS owner_remittances (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  property_id    INT NOT NULL,
  owner_id       INT NOT NULL,
  period         VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  gross_revenue  DECIMAL(12,2) DEFAULT 0,
  expenses       DECIMAL(12,2) DEFAULT 0,
  management_fee DECIMAL(12,2) DEFAULT 0,
  net_remittance DECIMAL(12,2) DEFAULT 0,
  status         ENUM('draft','sent','paid') DEFAULT 'draft',
  notes          TEXT DEFAULT NULL,
  created_by     INT DEFAULT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (owner_id)    REFERENCES users(id)
) ENGINE=InnoDB;

-- ── VENDORS / CONTRACTORS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  category     ENUM('plumbing','electrical','cleaning','security','pest_control','construction','it','other') DEFAULT 'other',
  phone        VARCHAR(20) DEFAULT NULL,
  email        VARCHAR(150) DEFAULT NULL,
  address      TEXT DEFAULT NULL,
  rating       TINYINT DEFAULT NULL COMMENT '1-5',
  notes        TEXT DEFAULT NULL,
  is_active    TINYINT(1) DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Link vendors to maintenance jobs
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS vendor_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quoted_cost DECIMAL(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vendor_invoice_ref VARCHAR(100) DEFAULT NULL,
  ADD FOREIGN KEY IF NOT EXISTS fk_maint_vendor (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

-- ── SHARED METER / BILL SPLITTING ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_meters (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  name         VARCHAR(100) NOT NULL COMMENT 'e.g. Block A Water Meter',
  utility_type ENUM('water','electricity','gas') NOT NULL,
  split_method ENUM('equal','by_unit','by_occupants','custom') DEFAULT 'equal',
  is_active    TINYINT(1) DEFAULT 1,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shared_meter_units (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  meter_id  INT NOT NULL,
  unit_id   INT NOT NULL,
  share_pct DECIMAL(5,2) DEFAULT NULL COMMENT 'for custom split',
  FOREIGN KEY (meter_id) REFERENCES shared_meters(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id)  REFERENCES units(id)
) ENGINE=InnoDB;

-- ── CCTV / ACCESS LOG ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_log (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  unit_id      INT DEFAULT NULL,
  event_type   ENUM('entry','exit','denied','alarm','camera_motion','intercom','gate_open','gate_close') NOT NULL,
  actor_name   VARCHAR(150) DEFAULT NULL,
  actor_id     INT DEFAULT NULL COMMENT 'user id if known',
  vehicle_plate VARCHAR(20) DEFAULT NULL,
  camera_id    VARCHAR(50) DEFAULT NULL,
  gate_id      VARCHAR(50) DEFAULT NULL,
  source       ENUM('manual','cctv','intercom','rfid','app','api') DEFAULT 'manual',
  notes        TEXT DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_property (property_id),
  INDEX idx_created  (created_at),
  FOREIGN KEY (property_id) REFERENCES properties(id)
) ENGINE=InnoDB;

-- ── ONBOARDING ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  tenancy_id INT NOT NULL,
  token      VARCHAR(100) NOT NULL UNIQUE,
  status     ENUM('pending','signed','expired') DEFAULT 'pending',
  signed_at  TIMESTAMP NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenancy_id) REFERENCES tenancies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── LANGUAGE PREFERENCE ───────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS language ENUM('en','sw') DEFAULT 'en';

-- ── LATE FEE INVOICES TRACKING ────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id INT DEFAULT NULL COMMENT 'for late fee invoices';

-- ── LEASE EXPIRY ALERT TRACKING ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lease_expiry_alerts (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  tenancy_id INT NOT NULL,
  days_before INT NOT NULL,
  sent_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenancy_id) REFERENCES tenancies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SELECT 'Migration v4 complete!' AS status;
