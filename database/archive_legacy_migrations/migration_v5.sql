-- SmartNyumba RMS — Migration v5 (Communication + Ratings + Reports)
USE smartnyumba;

-- In-app messaging
CREATE TABLE IF NOT EXISTS messages (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  from_user_id INT NOT NULL,
  to_user_id   INT DEFAULT NULL COMMENT 'NULL = broadcast to all staff',
  subject      VARCHAR(200) DEFAULT NULL,
  body         TEXT NOT NULL,
  is_read      TINYINT(1) DEFAULT 0,
  parent_id    INT DEFAULT NULL COMMENT 'for replies',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id)  REFERENCES properties(id),
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  INDEX idx_to   (to_user_id),
  INDEX idx_from (from_user_id)
) ENGINE=InnoDB;

-- Tenant satisfaction ratings
CREATE TABLE IF NOT EXISTS maintenance_ratings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL UNIQUE,
  tenant_id  INT NOT NULL,
  rating     TINYINT NOT NULL COMMENT '1-5 stars',
  comment    TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES maintenance_requests(id),
  FOREIGN KEY (tenant_id)  REFERENCES tenants(id)
) ENGINE=InnoDB;

-- WhatsApp log
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT DEFAULT NULL,
  phone        VARCHAR(20) NOT NULL,
  message      TEXT NOT NULL,
  type         VARCHAR(50) DEFAULT 'general',
  status       ENUM('pending','sent','failed','delivered','read') DEFAULT 'pending',
  provider_ref VARCHAR(100) DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone (phone)
) ENGINE=InnoDB;

-- Monthly report tracking
CREATE TABLE IF NOT EXISTS monthly_reports (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  property_id  INT NOT NULL,
  owner_id     INT DEFAULT NULL,
  period       VARCHAR(7) NOT NULL,
  report_data  MEDIUMTEXT COMMENT 'JSON snapshot',
  sent_at      TIMESTAMP NULL,
  email_status ENUM('pending','sent','failed') DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
) ENGINE=InnoDB;

SELECT 'Migration v5 complete!' AS status;
