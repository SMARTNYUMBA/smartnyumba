-- SmartNyumba RMS v6 - Commercial Release
USE smartnyumba;

-- User suspension
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspended_by INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT DEFAULT NULL;

-- Enhanced tenancies
ALTER TABLE tenancies
  ADD COLUMN IF NOT EXISTS billing_start_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_plan ENUM('monthly','quarterly','weekly','daily') DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS grace_period_days INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS penalty_rate DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS penalty_cap DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS due_day TINYINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_reason VARCHAR(255) DEFAULT NULL;

-- Documents repository
CREATE TABLE IF NOT EXISTS documents (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT DEFAULT NULL,
  tenancy_id   INT DEFAULT NULL,
  tenant_id    INT DEFAULT NULL,
  invoice_id   INT DEFAULT NULL,
  uploaded_by  INT NOT NULL,
  category     ENUM('lease','receipt','landlord_contract','compliance','agency_internal',
                    'tenant_screening','move_out_inspection','exit_checklist','other') DEFAULT 'other',
  title        VARCHAR(200) NOT NULL,
  filename     VARCHAR(300) NOT NULL,
  file_url     VARCHAR(500) NOT NULL,
  file_size    INT DEFAULT NULL,
  notes        TEXT DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_property (property_id),
  INDEX idx_tenancy  (tenancy_id)
) ENGINE=InnoDB;

-- Cases/Tickets
CREATE TABLE IF NOT EXISTS cases (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  tenancy_id   INT DEFAULT NULL,
  raised_by    INT NOT NULL,
  assigned_to  INT DEFAULT NULL,
  title        VARCHAR(200) NOT NULL,
  description  TEXT DEFAULT NULL,
  category     ENUM('noise','damage','billing','maintenance','security','neighbour',
                    'management','parking','other') DEFAULT 'other',
  priority     ENUM('low','normal','urgent','emergency') DEFAULT 'normal',
  status       ENUM('open','in_progress','resolved','closed') DEFAULT 'open',
  resolved_at  TIMESTAMP NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (raised_by)   REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS case_comments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  case_id    INT NOT NULL,
  user_id    INT NOT NULL,
  comment    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Security Logbook
CREATE TABLE IF NOT EXISTS security_log_incidents (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  logged_by    INT NOT NULL,
  incident_type VARCHAR(100) DEFAULT NULL,
  description  TEXT NOT NULL,
  location     VARCHAR(200) DEFAULT NULL,
  severity     ENUM('minor','moderate','major','critical') DEFAULT 'minor',
  status       ENUM('open','investigating','resolved','closed') DEFAULT 'open',
  occurred_at  DATETIME DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (logged_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS security_log_patrols (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  officer_id   INT NOT NULL,
  route        VARCHAR(200) DEFAULT NULL,
  notes        TEXT DEFAULT NULL,
  status       ENUM('completed','incomplete','issue_found') DEFAULT 'completed',
  patrol_start DATETIME DEFAULT NULL,
  patrol_end   DATETIME DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (officer_id)  REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS security_log_equipment (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  checked_by   INT NOT NULL,
  equipment    VARCHAR(200) NOT NULL,
  status       ENUM('ok','needs_repair','faulty','replaced') DEFAULT 'ok',
  notes        TEXT DEFAULT NULL,
  checked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (checked_by)  REFERENCES users(id)
) ENGINE=InnoDB;

-- Global search index (virtual - populated by triggers or app)
CREATE TABLE IF NOT EXISTS search_index (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  entity_type  VARCHAR(50) NOT NULL,
  entity_id    INT NOT NULL,
  search_text  TEXT NOT NULL,
  property_id  INT DEFAULT NULL,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_property (property_id),
  FULLTEXT KEY ft_search (search_text)
) ENGINE=InnoDB;

-- Role permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  role       VARCHAR(50) NOT NULL,
  resource   VARCHAR(100) NOT NULL,
  can_view   TINYINT(1) DEFAULT 1,
  can_create TINYINT(1) DEFAULT 0,
  can_edit   TINYINT(1) DEFAULT 0,
  can_delete TINYINT(1) DEFAULT 0,
  UNIQUE KEY uq_role_resource (role, resource)
) ENGINE=InnoDB;

-- Default role permissions
INSERT IGNORE INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete) VALUES
('property_manager','properties',1,1,1,0),
('property_manager','units',1,1,1,0),
('property_manager','tenants',1,1,1,0),
('property_manager','invoices',1,1,1,0),
('property_manager','payments',1,1,0,0),
('property_manager','expenses',1,1,1,1),
('property_manager','maintenance',1,1,1,0),
('property_manager','visitors',1,1,0,0),
('caretaker','units',1,0,0,0),
('caretaker','tenants',1,0,0,0),
('caretaker','maintenance',1,1,1,0),
('caretaker','utilities',1,1,0,0),
('security','units',1,0,0,0),
('security','visitors',1,1,0,0),
('security','parking',1,0,1,0);

SELECT 'Migration v6 complete!' AS status;
