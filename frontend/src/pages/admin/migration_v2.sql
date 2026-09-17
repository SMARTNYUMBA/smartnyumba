-- SmartNyumba Rental Management System — v2 Migration
USE smartnyumba;

-- Add property_id to users (for security/caretaker assignment)
ALTER TABLE users
  ADD COLUMN property_id INT DEFAULT NULL AFTER role,
  ADD COLUMN passport_number VARCHAR(30) DEFAULT NULL AFTER phone,
  ADD COLUMN profile_photo VARCHAR(300) DEFAULT NULL AFTER avatar_url,
  ADD FOREIGN KEY fk_user_property (property_id) REFERENCES properties(id) ON DELETE SET NULL;

-- Add passport_number to tenants
ALTER TABLE tenants
  ADD COLUMN passport_number VARCHAR(30) DEFAULT NULL AFTER id_number;

-- OTP table for SMS password reset
CREATE TABLE IF NOT EXISTS otp_codes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  phone      VARCHAR(20) NOT NULL,
  user_id    INT NOT NULL,
  code       VARCHAR(6) NOT NULL,
  purpose    ENUM('reset_password','verify_phone') DEFAULT 'reset_password',
  used       TINYINT(1) DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone (phone),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Add assignee columns to parking_slots (one slot, one holder)
ALTER TABLE parking_slots
  ADD COLUMN assigned_to_type ENUM('tenant','visitor','security','caretaker','manager','unassigned') DEFAULT 'unassigned',
  ADD COLUMN assigned_to_user_id INT DEFAULT NULL,
  ADD COLUMN assigned_to_unit_id INT DEFAULT NULL,
  ADD COLUMN assigned_vehicle_plate VARCHAR(20) DEFAULT NULL,
  ADD FOREIGN KEY fk_slot_user (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD FOREIGN KEY fk_slot_unit (assigned_to_unit_id) REFERENCES units(id) ON DELETE SET NULL;

-- Add tenant announcement flag
ALTER TABLE announcements
  ADD COLUMN target_audience ENUM('all','tenants','staff','specific_user') DEFAULT 'all',
  ADD COLUMN posted_by_role VARCHAR(30) DEFAULT NULL;

-- Notification table update — add property_id
ALTER TABLE notifications
  ADD COLUMN property_id INT DEFAULT NULL,
  ADD FOREIGN KEY fk_notif_property (property_id) REFERENCES properties(id) ON DELETE CASCADE;

-- Payment method: remove cash from tenant-accessible methods (enforced in app logic)
-- Transaction codes uppercase — enforced at insert time in controllers

-- Add lease document to tenancies
ALTER TABLE tenancies
  ADD COLUMN lease_document VARCHAR(300) DEFAULT NULL,
  ADD COLUMN move_in_checklist TEXT DEFAULT NULL;

-- Unit inspection log
CREATE TABLE IF NOT EXISTS unit_inspections (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  unit_id     INT NOT NULL,
  inspected_by INT NOT NULL,
  inspection_date DATE NOT NULL,
  condition   ENUM('excellent','good','fair','poor') DEFAULT 'good',
  notes       TEXT DEFAULT NULL,
  images      TEXT DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (unit_id) REFERENCES units(id),
  FOREIGN KEY (inspected_by) REFERENCES users(id)
) ENGINE=InnoDB;

SELECT 'Migration v2 applied successfully!' AS status;
