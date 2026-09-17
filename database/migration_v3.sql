
-- SmartNyumba RMS — Migration v3 (Full Feature Update)
USE smartnyumba;

-- Notifications: ensure property_id exists
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS property_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS action_url VARCHAR(300) DEFAULT NULL;

-- Tenancies: lease doc + move-in checklist
ALTER TABLE tenancies
  ADD COLUMN IF NOT EXISTS lease_document VARCHAR(300) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS move_in_checklist TEXT DEFAULT NULL COMMENT 'JSON array of checklist items';

-- Maintenance: SMS alert flag
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS sms_alerted TINYINT(1) DEFAULT 0;

-- Unit inspection log
CREATE TABLE IF NOT EXISTS unit_inspections (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  unit_id         INT NOT NULL,
  property_id     INT NOT NULL,
  inspected_by    INT NOT NULL,
  inspection_date DATE NOT NULL,
  condition_rating ENUM('excellent','good','fair','poor') DEFAULT 'good',
  notes           TEXT DEFAULT NULL,
  checklist       TEXT DEFAULT NULL COMMENT 'JSON',
  images          TEXT DEFAULT NULL COMMENT 'JSON array of image paths',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (unit_id) REFERENCES units(id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (inspected_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- OTP table (if not exists from v2)
CREATE TABLE IF NOT EXISTS otp_codes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  phone      VARCHAR(20) NOT NULL,
  user_id    INT NOT NULL,
  code       VARCHAR(6) NOT NULL,
  purpose    ENUM('reset_password','verify_phone') DEFAULT 'reset_password',
  used       TINYINT(1) DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Users: add property_id, passport, profile_photo if not exists
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS property_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS passport_number VARCHAR(30) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(300) DEFAULT NULL;

-- Tenants: passport
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS passport_number VARCHAR(30) DEFAULT NULL;

-- Visitors: host_user_id
ALTER TABLE visitors
  ADD COLUMN IF NOT EXISTS host_user_id INT DEFAULT NULL;

-- Parking: flexible assignment
ALTER TABLE parking_slots
  ADD COLUMN IF NOT EXISTS assigned_to_type ENUM('tenant','visitor','security','caretaker','manager','unassigned') DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS assigned_to_user_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_unit_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assigned_vehicle_plate VARCHAR(20) DEFAULT NULL;

-- Announcements: audience
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_audience ENUM('all','tenants','staff','specific_user') DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS posted_by_role VARCHAR(30) DEFAULT NULL;

SELECT 'Migration v3 complete!' AS status;
